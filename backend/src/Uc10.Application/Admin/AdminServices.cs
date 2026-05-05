using System.Text.Json;
using Uc10.Application.Abstractions;
using Uc10.Domain.Entities;
using Uc10.Domain.Enums;

namespace Uc10.Application.Admin;

public class AdminDashboardService
{
    private readonly IDashboardReader _reader;
    private readonly IIntegrationStatusRepository _integrations;

    public AdminDashboardService(IDashboardReader reader, IIntegrationStatusRepository integrations)
    {
        _reader = reader;
        _integrations = integrations;
    }

    public async Task<DashboardResponse> GetAsync(CancellationToken ct)
    {
        var snap = await _reader.ReadAsync(ct);
        var kpis = new KpiCards(
            snap.SubmissionsLast1h, snap.SubmissionsLast24h,
            Math.Round(snap.ErrorRate * 100m, 2),
            snap.ConfidenceHistogram.Sum(b => 0) // filled via review queue repo below — kept 0 here; AdminController merges
        );

        return new DashboardResponse(
            Kpis: kpis,
            ConfidenceHistogram: snap.ConfidenceHistogram
                .Select(b => new ConfidenceBucketDto(b.BucketStart, b.BucketEnd, b.Count)).ToList(),
            ModuleHealth: snap.ModuleHealth
                .Select(m => new ModuleHealthDto(m.Module, m.Invocations, m.SuccessRate, m.AverageConfidence, m.AverageDurationMs)).ToList(),
            Integrations: snap.Integrations
                .Select(i => new IntegrationDto(i.Name, i.Health.ToString().ToLowerInvariant(),
                    i.CircuitState == CircuitState.HalfOpen ? "half_open" : i.CircuitState.ToString().ToLowerInvariant(),
                    i.LastChecked, i.LastError)).ToList());
    }
}

public class ReviewQueueService
{
    private readonly IReviewQueueRepository _queue;
    private readonly IExpenseRepository _expenses;

    public ReviewQueueService(IReviewQueueRepository queue, IExpenseRepository expenses)
    {
        _queue = queue;
        _expenses = expenses;
    }

    public async Task<IReadOnlyList<ReviewQueueItemDto>> GetAsync(ReviewStatus? status, int limit, int offset, CancellationToken ct)
    {
        // Tab semantics:
        //   Pending   — items in the review_queue awaiting a human decision
        //   Approved  — every expense with final status=approved (both auto-
        //               approvals and claims manually approved via the queue)
        //   Rejected  — every expense with final status=rejected (same idea)
        // This gives the admin a single "all claims with outcome X" view rather
        // than only showing claims that passed through the manual queue.
        if (status == ReviewStatus.Approved || status == ReviewStatus.Rejected)
        {
            var mapped = status == ReviewStatus.Approved ? ExpenseStatus.Approved : ExpenseStatus.Rejected;
            var rows = await _expenses.GetByStatusWithUserEmailAsync(mapped, limit, offset, ct);
            return rows.Select(x => MapExpense(x.Expense, x.UserEmail, status.Value)).ToList();
        }

        // Pending (or null = all review-queue items in pending state).
        var queueRows = await _queue.GetPagedAsync(status, limit, offset, ct);
        return queueRows.Select(r => MapRow(r)).ToList();
    }

    public async Task DecideAsync(Guid id, ReviewStatus decision, Guid decidedBy, string? note, CancellationToken ct) =>
        await _queue.DecideAsync(id, decision, decidedBy, note, ct);

    private static ReviewQueueItemDto MapRow(ReviewQueueItem r)
    {
        // Headline values: prefer what OCR pulled from the receipt; fall back
        // to what the employee claimed at submission time. The fallback is
        // important for PDF receipts where OCR is skipped (Vision can't read
        // PDFs) — without it the row shows just "—" with no context.
        var (vendor, total, currency) = ExtractHeadline(r.Expense?.Result);
        return new ReviewQueueItemDto(
            Id: r.Id,
            ExpenseRefId: r.Expense?.RefId ?? "",
            UserEmail: "",                                            // controller can hydrate if needed
            Reason: r.Reason,
            Status: r.Status.ToString().ToLowerInvariant(),
            CreatedAt: r.CreatedAt,
            OverallConfidence: r.Expense?.OverallConfidence,
            Vendor:   vendor ?? r.Expense?.ClaimedMerchant ?? r.Expense?.Category,
            Total:    total  ?? r.Expense?.ClaimedAmount,
            Currency: currency);
    }

    // Build a row for an expense that may never have entered the review queue
    // (auto-approved path). We synthesise the Id from the expense id, use the
    // expense's reviewReason (or a default) and show submission time.
    private static ReviewQueueItemDto MapExpense(Expense e, string userEmail, ReviewStatus status)
    {
        var (vendor, total, currency) = ExtractHeadline(e.Result);
        var reason = !string.IsNullOrWhiteSpace(e.ReviewReason)
            ? e.ReviewReason!
            : status == ReviewStatus.Approved
                ? "Auto-approved by AI pipeline"
                : "Rejected by AI pipeline";
        return new ReviewQueueItemDto(
            Id: e.Id,                   // expense id is stable and unique
            ExpenseRefId: e.RefId,
            UserEmail: userEmail,
            Reason: reason,
            Status: status.ToString().ToLowerInvariant(),
            CreatedAt: e.CompletedAt ?? e.SubmittedAt,
            OverallConfidence: e.OverallConfidence,
            Vendor: vendor ?? e.ClaimedMerchant,
            Total:  total  ?? e.ClaimedAmount,
            Currency: currency);
    }

    private static (string? Vendor, decimal? Total, string Currency) ExtractHeadline(string? json)
    {
        if (string.IsNullOrEmpty(json)) return (null, null, "INR");
        try
        {
            using var doc = JsonDocument.Parse(json);
            var r = doc.RootElement;
            var v = r.TryGetProperty("vendor", out var vv) && vv.ValueKind == JsonValueKind.String ? vv.GetString() : null;
            var t = r.TryGetProperty("total",  out var tt) && tt.ValueKind == JsonValueKind.Number ? tt.GetDecimal() : (decimal?)null;
            var c = r.TryGetProperty("currency", out var cc) && cc.ValueKind == JsonValueKind.String ? (cc.GetString() ?? "INR") : "INR";
            return (v, t, c);
        }
        catch { return (null, null, "INR"); }
    }
}

public class ThresholdService
{
    private readonly IThresholdRepository _thresholds;
    public ThresholdService(IThresholdRepository thresholds) => _thresholds = thresholds;

    public async Task<IReadOnlyList<ThresholdDto>> GetAllAsync(CancellationToken ct)
    {
        var map = await _thresholds.GetAllAsync(ct);
        return map.Select(kv => new ThresholdDto(kv.Key, kv.Value, "", DateTimeOffset.MinValue)).ToList();
    }

    public async Task<decimal> UpdateAsync(string key, decimal value, Guid updatedBy, CancellationToken ct) =>
        await _thresholds.UpdateAsync(key, value, updatedBy, ct);
}

public class PolicyRulesService
{
    private readonly IPolicyRuleRepository _rules;
    public PolicyRulesService(IPolicyRuleRepository rules) => _rules = rules;

    public async Task<IReadOnlyList<PolicyRuleDto>> GetAllAsync(CancellationToken ct)
    {
        var rows = await _rules.GetAllAsync(ct);
        return rows.Select(Map).ToList();
    }

    public async Task<PolicyRuleDto> CreateAsync(PolicyRuleRequest req, Guid updatedBy, CancellationToken ct)
    {
        var type = Parse(req.Type);
        var rule = new Domain.Entities.PolicyRule
        {
            Id = Guid.NewGuid(),
            Code = req.Code,
            Name = req.Name,
            Description = req.Description ?? "",
            Type = type,
            Params = req.ParamsJson,
            Active = req.Active,
            Severity = req.Severity
        };
        var saved = await _rules.CreateAsync(rule, updatedBy, ct);
        return Map(saved);
    }

    public async Task<PolicyRuleDto> UpdateAsync(Guid id, PolicyRuleRequest req, Guid updatedBy, CancellationToken ct)
    {
        var type = Parse(req.Type);
        var rule = new Domain.Entities.PolicyRule
        {
            Id = id, Code = req.Code, Name = req.Name, Description = req.Description ?? "",
            Type = type, Params = req.ParamsJson, Active = req.Active, Severity = req.Severity
        };
        var saved = await _rules.UpdateAsync(id, rule, updatedBy, ct);
        return Map(saved);
    }

    private static PolicyRuleDto Map(Domain.Entities.PolicyRule r)
    {
        object parsed = new();
        try { using var doc = JsonDocument.Parse(r.Params); parsed = doc.RootElement.Clone(); } catch { }
        return new PolicyRuleDto(r.Id, r.Code, r.Name, r.Description,
            r.Type.ToString().ToLowerInvariant()
                .Replace("amountcap","amount_cap")
                .Replace("categoryblock","category_block")
                .Replace("requiregstin","require_gstin")
                .Replace("timewindow","time_window"),
            parsed, r.Active, r.Severity, r.UpdatedAt);
    }

    private static PolicyRuleType Parse(string v) => v.ToLowerInvariant() switch
    {
        "amount_cap"     => PolicyRuleType.AmountCap,
        "category_block" => PolicyRuleType.CategoryBlock,
        "require_gstin"  => PolicyRuleType.RequireGstin,
        "time_window"    => PolicyRuleType.TimeWindow,
        "fuzzy"          => PolicyRuleType.Fuzzy,
        _                => throw new ArgumentException($"unknown policy rule type '{v}'")
    };
}

public class AuditQueryService
{
    private readonly IAuditLogService _audit;
    public AuditQueryService(IAuditLogService audit) => _audit = audit;

    public async Task<IReadOnlyList<AuditLogRow>> QueryAsync(
        DateTimeOffset? from, DateTimeOffset? to, string? module, Guid? userId,
        int limit, int offset, CancellationToken ct)
    {
        var rows = await _audit.QueryAsync(from, to, module, userId, limit, offset, ct);
        return rows.Select(a => new AuditLogRow(
            a.Seq, a.Ts, a.UserId, a.ExpenseId, a.Module, a.ModelVersion,
            a.PromptVersion, a.InputRef, a.Confidence, a.PrevHash, a.Hash)).ToList();
    }

    public async Task<AuditVerifyResponse> VerifyChainAsync(CancellationToken ct)
    {
        var divergences = await _audit.VerifyChainAsync(ct);
        return new AuditVerifyResponse(divergences.Count == 0, divergences);
    }

    public Task<Stream> ExportCsvStreamAsync(DateTimeOffset? from, DateTimeOffset? to, CancellationToken ct) =>
        _audit.QueryAsync(from, to, null, null, int.MaxValue, 0, ct).ContinueWith(t =>
        {
            var rows = t.Result;
            var ms = new MemoryStream();
            using (var writer = new StreamWriter(ms, System.Text.Encoding.UTF8, leaveOpen: true))
            {
                writer.WriteLine("seq,ts,user_id,expense_id,module,model_version,prompt_version,confidence,prev_hash,hash");
                foreach (var r in rows)
                {
                    writer.WriteLine(string.Join(",", new[]
                    {
                        r.Seq.ToString(),
                        r.Ts.UtcDateTime.ToString("O"),
                        r.UserId?.ToString() ?? "",
                        r.ExpenseId?.ToString() ?? "",
                        Escape(r.Module),
                        Escape(r.ModelVersion),
                        Escape(r.PromptVersion ?? ""),
                        r.Confidence?.ToString("0.0000") ?? "",
                        r.PrevHash,
                        r.Hash
                    }));
                }
            }
            ms.Position = 0;
            return (Stream)ms;
        }, ct);

    private static string Escape(string s)
    {
        if (s.Contains(',') || s.Contains('"') || s.Contains('\n'))
            return "\"" + s.Replace("\"", "\"\"") + "\"";
        return s;
    }
}

public class IntegrationsService
{
    private readonly IIntegrationStatusRepository _repo;
    public IntegrationsService(IIntegrationStatusRepository repo) => _repo = repo;

    public async Task<IReadOnlyList<IntegrationDto>> GetAllAsync(CancellationToken ct)
    {
        var rows = await _repo.GetAllAsync(ct);
        return rows.Select(r => new IntegrationDto(
            r.Name,
            r.Health.ToString().ToLowerInvariant(),
            r.CircuitState == CircuitState.HalfOpen ? "half_open" : r.CircuitState.ToString().ToLowerInvariant(),
            r.LastChecked, r.LastError)).ToList();
    }
}
