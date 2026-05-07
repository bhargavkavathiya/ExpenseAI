using Uc10.Domain.Entities;
using Uc10.Domain.Enums;

namespace Uc10.Application.Abstractions;

public record ReceiptUpload(string ContentType, long SizeBytes, Stream Content, string? OriginalFileName);

public record ExpenseWithUserEmail(Expense Expense, string UserEmail);

// Full set of user-entered metadata attached to a claim at submit time.
// OCR results are independent verification; a diff between claimed_* and the
// OCR result is a useful audit signal and can be surfaced as a finding.
public record SubmissionMetadata(
    string?    Category,
    string?    PaymentMode,
    string?    Purpose,
    string?    City,
    decimal?   ClaimedAmount,
    DateOnly?  ClaimedDate,
    string?    ClaimedMerchant,
    string?    ClaimedGstin,
    string?    EmployeeName,
    string?    Department);

public interface IReceiptStorage
{
    // Persists to an on-disk path and returns (storagePath, phashIfComputed).
    Task<StoredReceipt> SaveAsync(string refId, ReceiptUpload upload, CancellationToken ct);
}

public record StoredReceipt(string StoragePath, long SizeBytes, string ContentType);

public record ReceiptFileRef(string StoragePath, string ContentType);

public interface IExpenseRepository
{
    // Calls sp_create_expense_submission and then stamps user-entered metadata
    // on the new row via a follow-up UPDATE. Returns the inserted expense id.
    Task<Guid> CreateSubmissionAsync(
        Guid userId, string refId, string contentType, long sizeBytes, string storagePath,
        string? phash, SubmissionMetadata? metadata, CancellationToken ct);

    Task<Expense?> GetByRefIdAsync(string refId, CancellationToken ct);
    Task<Expense?> GetByIdAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<Expense>> GetRecentForUserAsync(Guid userId, int limit, CancellationToken ct);

    // Returns the on-disk location + mime of the receipt attached to `refId`,
    // or null if the expense (or its receipt row) doesn't exist. Used by the
    // admin review drawer to stream the image back to the browser.
    Task<ReceiptFileRef?> GetReceiptRefAsync(string refId, CancellationToken ct);

    // For the admin Review Queue's Approved / Rejected tabs — returns every
    // expense at that final status (whether it passed through review_queue or
    // was auto-approved). Paired with user email so the UI can render it.
    Task<IReadOnlyList<ExpenseWithUserEmail>> GetByStatusWithUserEmailAsync(
        ExpenseStatus status, int limit, int offset, CancellationToken ct);

    Task UpdateResultAsync(
        Guid expenseId, ExpenseStatus status, decimal overallConfidence, bool needsReview,
        string? reviewReason, string resultJson, CancellationToken ct);

    Task UpdateStatusOnlyAsync(Guid expenseId, ExpenseStatus status, CancellationToken ct);

    // Sum of claimed_amount for the user on the given UTC date, excluding rejected expenses
    // and the current expense being processed (to avoid double-counting).
    Task<decimal> GetDailyTotalExcludingRejectedAsync(
        Guid userId, DateOnly date, Guid excludeExpenseId, CancellationToken ct);
}

public interface IAuditLogService
{
    // Calls sp_insert_audit_log_with_hash. Returns the new seq and hash.
    Task<AuditAppendResult> AppendAsync(
        Guid? userId, Guid? expenseId, string module, string modelVersion,
        string? promptVersion, string? inputRef, string outputSnapshotJson,
        decimal? confidence, CancellationToken ct);

    Task<IReadOnlyList<AuditLog>> QueryAsync(
        DateTimeOffset? from, DateTimeOffset? to, string? module, Guid? userId,
        int limit, int offset, CancellationToken ct);

    Task<IReadOnlyList<AuditChainDivergence>> VerifyChainAsync(CancellationToken ct);
}

public record AuditAppendResult(Guid Id, long Seq, string Hash);
public record AuditChainDivergence(long Seq, string ExpectedHash, string ActualHash);

public interface IThresholdRepository
{
    Task<IReadOnlyDictionary<string, decimal>> GetAllAsync(CancellationToken ct);
    Task<decimal?> GetAsync(string key, CancellationToken ct);
    Task<decimal> UpdateAsync(string key, decimal value, Guid updatedBy, CancellationToken ct);
}

public interface IReviewQueueRepository
{
    Task EnqueueAsync(Guid expenseId, string reason, CancellationToken ct);
    Task<IReadOnlyList<ReviewQueueItem>> GetPagedAsync(ReviewStatus? status, int limit, int offset, CancellationToken ct);
    Task<ReviewQueueItem?> GetAsync(Guid id, CancellationToken ct);
    Task DecideAsync(Guid id, ReviewStatus status, Guid decidedBy, string? note, CancellationToken ct);
}

public interface IPolicyRuleRepository
{
    Task<IReadOnlyList<PolicyRule>> GetActiveAsync(CancellationToken ct);
    Task<IReadOnlyList<PolicyRule>> GetAllAsync(CancellationToken ct);
    Task<PolicyRule?> GetByIdAsync(Guid id, CancellationToken ct);
    Task<PolicyRule> CreateAsync(PolicyRule rule, Guid updatedBy, CancellationToken ct);
    Task<PolicyRule> UpdateAsync(Guid id, PolicyRule rule, Guid updatedBy, CancellationToken ct);
}

public interface IIntegrationStatusRepository
{
    Task<IReadOnlyList<IntegrationStatus>> GetAllAsync(CancellationToken ct);
    Task RecordSuccessAsync(string name, CancellationToken ct);
    Task RecordFailureAsync(string name, string error, CancellationToken ct);
}

public interface IDashboardReader
{
    Task<DashboardSnapshot> ReadAsync(CancellationToken ct);
}

public record DashboardSnapshot(
    int SubmissionsLast1h,
    int SubmissionsLast24h,
    int PendingReviews,
    decimal ErrorRate,
    IReadOnlyList<ConfidenceBucket> ConfidenceHistogram,
    IReadOnlyList<ModuleHealth> ModuleHealth,
    IReadOnlyList<IntegrationStatus> Integrations,
    IReadOnlyList<StatusCount> StatusDistribution,
    IReadOnlyList<HourlyVolume> HourlyVolumes
);

public record StatusCount(string Status, int Count);
public record HourlyVolume(DateTime Hour, string Status, int Count);

public record ConfidenceBucket(decimal BucketStart, decimal BucketEnd, int Count);
public record ModuleHealth(string Module, int Invocations, decimal SuccessRate, decimal AverageConfidence, int AverageDurationMs);

public interface IDuplicateHashRepository
{
    Task AppendAsync(Guid userId, Guid expenseId, string phash, CancellationToken ct);
    // Returns the minimum Hamming distance between phash and any prior within `windowDays`, or null if no history.
    Task<int?> MinHammingDistanceAsync(Guid userId, string phash, int windowDays, CancellationToken ct);
}
