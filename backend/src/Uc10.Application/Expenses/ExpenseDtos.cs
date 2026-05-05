using Uc10.Domain.Enums;

namespace Uc10.Application.Expenses;

public record ExpenseSubmissionResponse(
    string RefId,
    string Status,               // "processing"
    DateTimeOffset SubmittedAt);

public record ExpenseDecisionResponse(
    string RefId,
    string Status,               // expense_status
    DateTimeOffset SubmittedAt,
    DateTimeOffset? CompletedAt,
    decimal? OverallConfidence,
    bool NeedsReview,
    string? ReviewReason,
    // User-entered claim metadata captured at submit time.
    string? Category,
    string? PaymentMode,
    string? Purpose,
    string? City,
    // Claimed values the employee typed in — compared with OCR extract for audit.
    decimal? ClaimedAmount,
    string?  ClaimedDate,           // ISO date string on the wire
    string?  ClaimedMerchant,
    string?  ClaimedGstin,
    string?  EmployeeName,
    string?  Department,
    // Per-module AI output (OCR extract, duplicate, anomaly, policy).
    ExpenseResultDto? Result,
    // AI-generated human-readable audit findings — shown as coloured cards on
    // the decision page. Each has severity (info/warn/error) and a one-liner.
    IReadOnlyList<FindingDto> Findings,
    // Which AI modules ran and their status — rendered as chips at the bottom.
    IReadOnlyList<ModuleExecutionDto> ModulesExecuted);

public record FindingDto(string Severity, string Message);

public record ModuleExecutionDto(string Module, string Status);  // 'ok' | 'warn' | 'failed' | 'skipped'

public record ExpenseResultDto(
    string? Vendor,
    string? Gstin,
    bool? GstinVerified,
    DateOnly? Date,
    decimal? Total,
    string Currency,
    IReadOnlyList<ReceiptItemDto> Items,
    decimal OverallConfidence,
    string DecisionStatus,
    string? Explanation,
    PerModuleDto PerModule,
    bool NeedsReview,
    string? ReviewReason);

public record ReceiptItemDto(string Description, decimal Quantity, decimal? UnitPrice, decimal? Total);

public record PerModuleDto(ModuleResultDto Ocr, ModuleResultDto Duplicate, ModuleResultDto Anomaly, ModuleResultDto Policy);
public record ModuleResultDto(string ModelVersion, string? PromptVersion, decimal Score, string? Summary, object? Details);

public record ExpenseSummaryDto(
    string RefId,
    string Status,
    DateTimeOffset SubmittedAt,
    decimal? OverallConfidence,
    string? Vendor,
    decimal? Total,
    string Currency,
    string? Category,
    decimal? ClaimedAmount);
