using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Uc10.Application.Abstractions;
using Uc10.Domain.Enums;

namespace Uc10.Application.Expenses;

// Runs the full AI pipeline for a single submitted expense:
//   1. OCR extraction
//   2. Duplicate detection (needs OCR's vendor+total? no — works on the image hash)
//   3. Anomaly detection (needs OCR's total)
//   4. Policy evaluation (needs OCR's fields)
//   5. Aggregation + explanation
//   6. Persist result on the expense, append audit log rows, route to review queue if needed
//
// Every module invocation writes an `audit_logs` row via the sp_insert_audit_log_with_hash
// stored procedure, so tampering with any of them is detectable via fn_verify_audit_chain.
public class ExpenseDecisionOrchestrator
{
    private readonly IOcrExtractionService _ocr;
    private readonly IDuplicateDetectionService _duplicate;
    private readonly IAnomalyDetectionService _anomaly;
    private readonly IPolicyRuleEngine _policy;
    private readonly IConfidenceAggregator _aggregator;
    private readonly IPerceptualHasher _phasher;
    private readonly IAuditLogService _audit;
    private readonly IExpenseRepository _expenses;
    private readonly IReviewQueueRepository _reviewQueue;
    private readonly IDuplicateHashRepository _phashRepo;
    private readonly ILogger<ExpenseDecisionOrchestrator> _log;

    public ExpenseDecisionOrchestrator(
        IOcrExtractionService ocr, IDuplicateDetectionService duplicate, IAnomalyDetectionService anomaly,
        IPolicyRuleEngine policy, IConfidenceAggregator aggregator, IPerceptualHasher phasher,
        IAuditLogService audit, IExpenseRepository expenses, IReviewQueueRepository reviewQueue,
        IDuplicateHashRepository phashRepo,
        ILogger<ExpenseDecisionOrchestrator> log)
    {
        _ocr = ocr;
        _duplicate = duplicate;
        _anomaly = anomaly;
        _policy = policy;
        _aggregator = aggregator;
        _phasher = phasher;
        _audit = audit;
        _expenses = expenses;
        _reviewQueue = reviewQueue;
        _phashRepo = phashRepo;
        _log = log;
    }

    public async Task RunAsync(Guid expenseId, string refId, Guid userId, string storagePath, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            // 1. OCR
            var ocr = await _ocr.ExtractAsync(storagePath, ct);
            await AuditAsync(userId, expenseId, ocr.Score, refId);

            // 2. Duplicate: compute pHash + check vs history
            var phash = await _phasher.HashAsync(storagePath, ct);
            var duplicate = await _duplicate.CheckAsync(
                new DuplicateCheckInput(userId, phash, DateTimeOffset.UtcNow), ct);
            await _phashRepo.AppendAsync(userId, expenseId, phash, ct);
            await AuditAsync(userId, expenseId, duplicate, refId);

            // 3. Anomaly
            var anomaly = await _anomaly.CheckAsync(
                new AnomalyCheckInput(userId, ocr.Total ?? 0m, DateTimeOffset.UtcNow, ocr.Vendor), ct);
            await AuditAsync(userId, expenseId, anomaly, refId);

            // 4. Policy
            var policy = await _policy.EvaluateAsync(
                new PolicyEvaluationInput(ocr.Vendor, ocr.Gstin, ocr.Total, ocr.Currency, ocr.Date, null), ct);
            await AuditAsync(userId, expenseId, policy.Score, refId);

            // 5. Aggregate
            var decision = await _aggregator.AggregateAsync(ocr.Score, duplicate, anomaly, policy.Score, ct);

            // 5b. Claim-integrity override. Per-module scores only know what the
            // modules saw in isolation — they don't cross-check what the employee
            // CLAIMED against what OCR EXTRACTED. A 5%+ amount difference or a
            // non-matching merchant / GSTIN means the submitted claim is
            // unreliable and must go to human review, regardless of the
            // aggregator's confidence score.
            decision = await ApplyIntegrityOverrideAsync(expenseId, ocr, decision, ct);

            // 6. Build + persist result
            var result = BuildResult(ocr, duplicate, anomaly, policy, decision);
            var resultJson = JsonSerializer.Serialize(result);

            var status = decision.DecisionStatus switch
            {
                "approved"      => ExpenseStatus.Approved,
                "needs_review"  => ExpenseStatus.NeedsReview,
                "rejected"      => ExpenseStatus.Rejected,
                _               => ExpenseStatus.Approved
            };

            await _expenses.UpdateResultAsync(
                expenseId, status, decision.OverallConfidence, decision.NeedsReview,
                decision.ReviewReason, resultJson, ct);

            if (decision.NeedsReview)
                await _reviewQueue.EnqueueAsync(expenseId, decision.ReviewReason ?? "needs review", ct);

            // Aggregator-level audit row — captures the final decision + all modules.
            await _audit.AppendAsync(
                userId, expenseId, AiModuleNames.Aggregator, "aggregator_v1.0.0", null, refId,
                JsonSerializer.Serialize(new
                {
                    overall = decision.OverallConfidence,
                    status = decision.DecisionStatus,
                    needs_review = decision.NeedsReview,
                    reason = decision.ReviewReason
                }),
                decision.OverallConfidence, ct);

            _log.LogInformation(
                "Expense {RefId} decided={Status} conf={Conf} in {Ms}ms",
                refId, decision.DecisionStatus, decision.OverallConfidence, sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Expense pipeline failed ref={RefId}", refId);
            await _expenses.UpdateStatusOnlyAsync(expenseId, ExpenseStatus.Failed, ct);
            try
            {
                await _audit.AppendAsync(
                    userId, expenseId, "pipeline_error", "pipeline_v1.0.0", null, refId,
                    JsonSerializer.Serialize(new { error = ex.Message, type = ex.GetType().Name }),
                    confidence: null, ct);
            }
            catch { /* best-effort audit on failure */ }
        }
    }

    private Task AuditAsync(Guid userId, Guid expenseId, ModuleScore m, string refId) =>
        _audit.AppendAsync(
            userId, expenseId, m.Module, m.ModelVersion, m.PromptVersion, refId,
            JsonSerializer.Serialize(new { score = m.Score, summary = m.Summary, details = m.Details }),
            m.Score, CancellationToken.None);

    private async Task<AggregatedDecision> ApplyIntegrityOverrideAsync(
        Guid expenseId, OcrExtraction ocr, AggregatedDecision current, CancellationToken ct)
    {
        var submitted = await _expenses.GetByIdAsync(expenseId, ct);
        if (submitted is null) return current;

        var mismatches = new List<string>();

        // Amount: >5% delta between claim and OCR is a hard integrity failure.
        if (submitted.ClaimedAmount is decimal claimed && claimed > 0m &&
            ocr.Total is decimal extracted && extracted > 0m)
        {
            var delta = Math.Abs(claimed - extracted) / claimed;
            if (delta > 0.05m)
                mismatches.Add($"amount claimed ₹{claimed:0} vs OCR ₹{extracted:0}");
        }

        // Merchant: Allow 65% similarity to handle variations like "ANANDHA BHAVAN" vs "ANANDHA BHAVAN A/C"
        if (!string.IsNullOrWhiteSpace(submitted.ClaimedMerchant) && !string.IsNullOrWhiteSpace(ocr.Vendor))
        {
            var sim = CalculateSimilarity(submitted.ClaimedMerchant.Trim().ToUpperInvariant(), ocr.Vendor.Trim().ToUpperInvariant());
            if (sim < 0.65)
            {
                mismatches.Add($"merchant claimed '{submitted.ClaimedMerchant}' vs OCR '{ocr.Vendor}' (similarity {sim:P0})");
            }
        }

        var isRejected = false;

        // GSTIN: 15-char exact match.
        if (!string.IsNullOrWhiteSpace(submitted.ClaimedGstin) &&
            !string.IsNullOrWhiteSpace(ocr.Gstin) &&
            !submitted.ClaimedGstin.Equals(ocr.Gstin, StringComparison.OrdinalIgnoreCase))
        {
            mismatches.Add($"claimed GSTIN {submitted.ClaimedGstin} vs OCR {ocr.Gstin}");
            isRejected = true;
        }

        if (mismatches.Count == 0) return current;

        // Semantics: keep the AI confidence number unchanged (it reflects module
        // quality, which is fine) but OVERRIDE the workflow status so the claim
        // routes to human review with a clear reason. Clamp to 0.55 so the
        // "below threshold" visual matches the reality that it won't auto-approve.
        var reason = $"Submitted claim differs from receipt OCR — {string.Join("; ", mismatches)}";
        _log.LogInformation("Integrity override on {Id}: {Reason}", expenseId, reason);

        return current with
        {
            DecisionStatus    = isRejected ? "rejected" : "needs_review",
            NeedsReview       = !isRejected,
            ReviewReason      = reason,
            OverallConfidence = Math.Min(current.OverallConfidence, isRejected ? 0.20m : 0.55m)
        };
    }

    private static object BuildResult(
        OcrExtraction ocr, ModuleScore duplicate, ModuleScore anomaly, PolicyEvaluationResult policy,
        AggregatedDecision decision) =>
        new
        {
            vendor        = ocr.Vendor,
            gstin         = ocr.Gstin,
            gstin_verified = (bool?)null,
            date          = ocr.Date?.ToString("yyyy-MM-dd"),
            total         = ocr.Total,
            currency      = ocr.Currency,
            items         = ocr.Items,
            overall_confidence = decision.OverallConfidence,
            decision_status    = decision.DecisionStatus,
            needs_review       = decision.NeedsReview,
            review_reason      = decision.ReviewReason,
            per_module = new
            {
                ocr       = new { model_version = ocr.Score.ModelVersion, prompt_version = ocr.Score.PromptVersion, score = ocr.Score.Score, summary = ocr.Score.Summary, details = ocr.Score.Details },
                duplicate = new { model_version = duplicate.ModelVersion,    prompt_version = duplicate.PromptVersion,    score = duplicate.Score,    summary = duplicate.Summary,    details = duplicate.Details },
                anomaly   = new { model_version = anomaly.ModelVersion,      prompt_version = anomaly.PromptVersion,      score = anomaly.Score,      summary = anomaly.Summary,      details = anomaly.Details },
                policy    = new { model_version = policy.Score.ModelVersion, prompt_version = policy.Score.PromptVersion, score = policy.Score.Score, summary = policy.Score.Summary, details = policy.Score.Details, violations = policy.Violations }
            }
        };

    private static double CalculateSimilarity(string source, string target)
    {
        if (source == target) return 1.0;
        
        // Substring check easily handles dropped words like "SHRI GOWRI" vs "SHRI GOWRI KRISHNAA"
        if (source.Length > 4 && target.Contains(source)) return 0.90;
        if (target.Length > 4 && source.Contains(target)) return 0.90;

        int stepsToSame = ComputeLevenshteinDistance(source, target);
        return 1.0 - ((double)stepsToSame / Math.Max(source.Length, target.Length));
    }

    private static int ComputeLevenshteinDistance(string source, string target)
    {
        if (string.IsNullOrEmpty(source)) return string.IsNullOrEmpty(target) ? 0 : target.Length;
        if (string.IsNullOrEmpty(target)) return source.Length;

        int[,] distance = new int[source.Length + 1, target.Length + 1];

        for (int i = 0; i <= source.Length; distance[i, 0] = i++) ;
        for (int j = 0; j <= target.Length; distance[0, j] = j++) ;

        for (int i = 1; i <= source.Length; i++)
        {
            for (int j = 1; j <= target.Length; j++)
            {
                int cost = (target[j - 1] == source[i - 1]) ? 0 : 1;
                distance[i, j] = Math.Min(
                    Math.Min(distance[i - 1, j] + 1, distance[i, j - 1] + 1),
                    distance[i - 1, j - 1] + cost);
            }
        }
        return distance[source.Length, target.Length];
    }
}
