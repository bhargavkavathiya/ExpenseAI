using Uc10.Application.Abstractions;
using Uc10.Domain.Enums;

namespace Uc10.Application.Admin;

public record DashboardResponse(
    KpiCards Kpis,
    IReadOnlyList<ConfidenceBucketDto> ConfidenceHistogram,
    IReadOnlyList<ModuleHealthDto> ModuleHealth,
    IReadOnlyList<IntegrationDto> Integrations,
    IReadOnlyList<StatusCountDto> StatusDistribution,
    IReadOnlyList<HourlyVolumeDto> HourlyVolumes);

public record StatusCountDto(string Status, int Count);
public record HourlyVolumeDto(DateTime Hour, string Status, int Count);

public record KpiCards(int SubmissionsLast1h, int SubmissionsLast24h, decimal ErrorRatePercent, int PendingReviews);
public record ConfidenceBucketDto(decimal BucketStart, decimal BucketEnd, int Count);
public record ModuleHealthDto(string Module, int Invocations, decimal SuccessRate, decimal AverageConfidence, int AverageDurationMs);
public record IntegrationDto(string Name, string Health, string CircuitState, DateTimeOffset? LastChecked, string? LastError);

public record ReviewQueueItemDto(
    Guid Id,
    string ExpenseRefId,
    string UserEmail,
    string Reason,
    string Status,
    DateTimeOffset CreatedAt,
    decimal? OverallConfidence,
    string? Vendor,
    decimal? Total,
    string Currency);

public record ReviewDecisionRequest(string? Note);

public record ThresholdDto(string Key, decimal Value, string Description, DateTimeOffset UpdatedAt);
public record UpdateThresholdRequest(decimal Value);

public record PolicyRuleDto(
    Guid Id, string Code, string Name, string Description, string Type, object Params,
    bool Active, string Severity, DateTimeOffset UpdatedAt);

public record PolicyRuleRequest(
    string Code, string Name, string Description, string Type, string ParamsJson,
    bool Active, string Severity);

public record AuditLogRow(
    long Seq, DateTimeOffset Ts, Guid? UserId, Guid? ExpenseId, string Module,
    string ModelVersion, string? PromptVersion, string? InputRef,
    decimal? Confidence, string PrevHash, string Hash);

public record AuditVerifyResponse(bool Intact, IReadOnlyList<AuditChainDivergence> Divergences);
