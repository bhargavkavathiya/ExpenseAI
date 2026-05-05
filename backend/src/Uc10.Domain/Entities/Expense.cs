using Uc10.Domain.Enums;

namespace Uc10.Domain.Entities;

public class Expense
{
    public Guid Id { get; set; }
    public string RefId { get; set; } = default!;
    public Guid UserId { get; set; }
    public ExpenseStatus Status { get; set; } = ExpenseStatus.Processing;
    public DateTimeOffset SubmittedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? Result { get; set; }             // JSONB serialised in infra
    public decimal? OverallConfidence { get; set; }
    public bool NeedsReview { get; set; }
    public string? ReviewReason { get; set; }

    // User-entered claim metadata (all optional).
    public string?  Category    { get; set; }
    public string?  PaymentMode { get; set; }
    public string?  Purpose     { get; set; }
    public string?  City        { get; set; }

    // Claimed values — what the employee says the receipt shows. OCR ground
    // truth stays in Result JSONB; the orchestrator compares the two for
    // audit integrity (see ApplyIntegrityOverrideAsync).
    public decimal?  ClaimedAmount   { get; set; }
    public DateOnly? ClaimedDate     { get; set; }
    public string?   ClaimedMerchant { get; set; }
    public string?   ClaimedGstin    { get; set; }

    // Snapshot of the employee's profile at submit time — denormalised so
    // later profile edits don't rewrite the history of past claims.
    public string? EmployeeName { get; set; }
    public string? Department   { get; set; }

    public User? User { get; set; }
    public ReceiptFile? Receipt { get; set; }
}

public class ReceiptFile
{
    public Guid Id { get; set; }
    public Guid ExpenseId { get; set; }
    public string ContentType { get; set; } = default!;
    public long SizeBytes { get; set; }
    public string StoragePath { get; set; } = default!;
    public string? PHash { get; set; }
    public DateTimeOffset UploadedAt { get; set; }

    public Expense? Expense { get; set; }
}
