namespace Uc10.Domain.Entities;

public class AuditLog
{
    public Guid Id { get; set; }
    public long Seq { get; set; }
    public DateTimeOffset Ts { get; set; }
    public Guid? UserId { get; set; }
    public Guid? ExpenseId { get; set; }
    public string Module { get; set; } = default!;
    public string ModelVersion { get; set; } = default!;
    public string? PromptVersion { get; set; }
    public string? InputRef { get; set; }
    public string OutputSnapshot { get; set; } = "{}";     // JSONB
    public decimal? Confidence { get; set; }
    public string PrevHash { get; set; } = default!;
    public string Hash { get; set; } = default!;
}

public class AiInvocation
{
    public Guid Id { get; set; }
    public Guid ExpenseId { get; set; }
    public string Module { get; set; } = default!;
    public string ModelVersion { get; set; } = default!;
    public string? PromptVersion { get; set; }
    public string? InputRef { get; set; }
    public string? Output { get; set; }                    // JSONB
    public decimal? Confidence { get; set; }
    public int? DurationMs { get; set; }
    public string Status { get; set; } = "ok";
    public string? ErrorMessage { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
