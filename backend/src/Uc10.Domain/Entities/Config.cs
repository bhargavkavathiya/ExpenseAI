using Uc10.Domain.Enums;

namespace Uc10.Domain.Entities;

public class PolicyRule
{
    public Guid Id { get; set; }
    public string Code { get; set; } = default!;
    public string Name { get; set; } = default!;
    public string Description { get; set; } = "";
    public PolicyRuleType Type { get; set; }
    public string Params { get; set; } = "{}";            // JSONB
    public bool Active { get; set; } = true;
    public string Severity { get; set; } = "medium";
    public Guid? UpdatedBy { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class Threshold
{
    public string Key { get; set; } = default!;
    public decimal Value { get; set; }
    public string Description { get; set; } = "";
    public Guid? UpdatedBy { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class ReviewQueueItem
{
    public Guid Id { get; set; }
    public Guid ExpenseId { get; set; }
    public string Reason { get; set; } = default!;
    public ReviewStatus Status { get; set; } = ReviewStatus.Pending;
    public Guid? AssignedTo { get; set; }
    public Guid? DecidedBy { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
    public string? DecisionNote { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Expense? Expense { get; set; }
}

public class GstinCacheEntry
{
    public string Gstin { get; set; } = default!;
    public string? LegalName { get; set; }
    public string? Status { get; set; }
    public string? Payload { get; set; }                  // JSONB
    public DateTimeOffset CachedAt { get; set; }
    public int TtlSeconds { get; set; } = 86400;
}

public class DuplicateHash
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ExpenseId { get; set; }
    public string PHash { get; set; } = default!;
    public DateTimeOffset CreatedAt { get; set; }
}

public class AnomalyProfile
{
    public Guid UserId { get; set; }
    public int SampleCount { get; set; }
    public decimal MeanAmount { get; set; }
    public decimal StddevAmount { get; set; }
    public decimal? LastAmount { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class IntegrationStatus
{
    public Guid Id { get; set; }
    public string Name { get; set; } = default!;
    public IntegrationHealth Health { get; set; } = IntegrationHealth.Unknown;
    public CircuitState CircuitState { get; set; } = CircuitState.Closed;
    public DateTimeOffset? LastChecked { get; set; }
    public string? LastError { get; set; }
    public int ConsecutiveFailures { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
