using Uc10.Domain.Entities;

namespace Uc10.Application.Abstractions;

// ---------- shared result types ----------

public record ModuleScore(
    string Module,
    string ModelVersion,
    string? PromptVersion,
    decimal Score,                 // 0..1, higher = more confident/more suspicious depending on module — see notes below
    string? Summary,
    IReadOnlyDictionary<string, object?> Details
);

// Per-module "higher score = better/cleaner" convention unless noted.
// OCR:        score = extraction confidence (higher is better).
// Duplicate:  score = "not a duplicate" probability (higher is better; low score flags a likely duplicate).
// Anomaly:    score = "within pattern" probability (higher is better; low score flags an anomaly).
// Policy:     score = "no violations" probability (higher is better).

public record OcrExtraction(
    string? Vendor,
    string? Gstin,
    DateOnly? Date,
    decimal? Total,
    string Currency,
    IReadOnlyList<ReceiptLineItem> Items,
    ModuleScore Score
);

public record ReceiptLineItem(string Description, decimal Quantity, decimal? UnitPrice, decimal? Total);

public record DuplicateCheckInput(Guid UserId, string PHash, DateTimeOffset SubmittedAt);

public record AnomalyCheckInput(Guid UserId, decimal Amount, DateTimeOffset Date, string? VendorCategory);

public record PolicyEvaluationInput(
    string? Vendor,
    string? Gstin,
    decimal? Amount,
    string Currency,
    DateOnly? Date,
    string? CategoryHint
);

public record PolicyViolation(string RuleCode, string RuleName, bool Violated, string Reason, string Severity, decimal Confidence);

public record PolicyEvaluationResult(IReadOnlyList<PolicyViolation> Violations, ModuleScore Score);

public record GstinLookupResult(string Gstin, bool Verified, string? LegalName, string? Status, bool CircuitOpen);

// ---------- module contracts ----------

public interface IOcrExtractionService
{
    // Reads the receipt from storagePath and returns structured fields.
    Task<OcrExtraction> ExtractAsync(string storagePath, CancellationToken ct);
}

public interface IDuplicateDetectionService
{
    Task<ModuleScore> CheckAsync(DuplicateCheckInput input, CancellationToken ct);
}

public interface IAnomalyDetectionService
{
    Task<ModuleScore> CheckAsync(AnomalyCheckInput input, CancellationToken ct);
}

public interface IPolicyRuleEngine
{
    Task<PolicyEvaluationResult> EvaluateAsync(PolicyEvaluationInput input, CancellationToken ct);
}

public interface IGstinLookupService
{
    Task<GstinLookupResult> LookupAsync(string gstin, CancellationToken ct);
}

public interface IConfidenceAggregator
{
    // Weights are pulled from `thresholds` table at call time.
    Task<AggregatedDecision> AggregateAsync(
        ModuleScore ocr, ModuleScore duplicate, ModuleScore anomaly, ModuleScore policy,
        CancellationToken ct);
}

public record AggregatedDecision(
    decimal OverallConfidence,
    bool NeedsReview,
    string? ReviewReason,
    string DecisionStatus        // "approved" | "needs_review" | "rejected"
);

public interface IPerceptualHasher
{
    // Returns a 16-char hex string (64-bit pHash).
    Task<string> HashAsync(string storagePath, CancellationToken ct);
}
