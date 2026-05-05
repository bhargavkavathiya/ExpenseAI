using FluentAssertions;
using Uc10.Application.Abstractions;
using Uc10.Application.Expenses;
using Uc10.Domain.Enums;
using Xunit;

namespace Uc10.Tests;

public class ConfidenceAggregatorTests
{
    private sealed class FakeThresholds : IThresholdRepository
    {
        private readonly Dictionary<string, decimal> _values;
        public FakeThresholds(Dictionary<string, decimal> values) => _values = values;
        public Task<IReadOnlyDictionary<string, decimal>> GetAllAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyDictionary<string, decimal>>(_values);
        public Task<decimal?> GetAsync(string key, CancellationToken ct) =>
            Task.FromResult<decimal?>(_values.TryGetValue(key, out var v) ? v : null);
        public Task<decimal> UpdateAsync(string key, decimal value, Guid by, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private static ModuleScore M(string name, decimal s, Dictionary<string, object?>? extras = null) =>
        new(name, name + "_v1", null, s, null, extras ?? new Dictionary<string, object?>());

    private static WeightedAverageConfidenceAggregator Build(decimal min = 0.6m) =>
        new(new FakeThresholds(new()
        {
            ["ocr_weight"]       = 0.3m,
            ["duplicate_weight"] = 0.2m,
            ["anomaly_weight"]   = 0.2m,
            ["policy_weight"]    = 0.3m,
            ["confidence_min"]   = min
        }));

    [Fact]
    public async Task All_perfect_scores_approves()
    {
        var agg = Build();
        var d = await agg.AggregateAsync(M(AiModuleNames.Ocr, 1m), M(AiModuleNames.Duplicate, 1m),
            M(AiModuleNames.Anomaly, 1m), M(AiModuleNames.Policy, 1m), CancellationToken.None);
        d.OverallConfidence.Should().Be(1.0000m);
        d.DecisionStatus.Should().Be("approved");
        d.NeedsReview.Should().BeFalse();
    }

    [Fact]
    public async Task Low_overall_routes_to_review()
    {
        var agg = Build(min: 0.6m);
        // Weighted average = (0.5*0.3 + 0.5*0.2 + 0.5*0.2 + 0.5*0.3) = 0.5 < 0.6 → needs_review
        var d = await agg.AggregateAsync(M(AiModuleNames.Ocr, 0.5m), M(AiModuleNames.Duplicate, 0.5m),
            M(AiModuleNames.Anomaly, 0.5m), M(AiModuleNames.Policy, 0.5m), CancellationToken.None);
        d.OverallConfidence.Should().Be(0.5000m);
        d.DecisionStatus.Should().Be("needs_review");
        d.NeedsReview.Should().BeTrue();
    }

    [Fact]
    public async Task Strong_duplicate_signal_rejects_regardless_of_overall()
    {
        var agg = Build();
        var d = await agg.AggregateAsync(M(AiModuleNames.Ocr, 1m), M(AiModuleNames.Duplicate, 0.1m),
            M(AiModuleNames.Anomaly, 1m), M(AiModuleNames.Policy, 1m), CancellationToken.None);
        d.DecisionStatus.Should().Be("rejected");
    }

    [Fact]
    public async Task High_severity_policy_violation_forces_review_even_if_overall_is_high()
    {
        var agg = Build();
        var d = await agg.AggregateAsync(
            M(AiModuleNames.Ocr, 1m), M(AiModuleNames.Duplicate, 1m), M(AiModuleNames.Anomaly, 1m),
            M(AiModuleNames.Policy, 1m, new Dictionary<string, object?> { ["high_severity_violations"] = 1 }),
            CancellationToken.None);
        d.DecisionStatus.Should().Be("needs_review");
        d.NeedsReview.Should().BeTrue();
    }

    [Fact]
    public async Task Weights_respect_configured_sum_even_if_not_one()
    {
        var thresholds = new FakeThresholds(new()
        {
            ["ocr_weight"]       = 1m,      // 1
            ["duplicate_weight"] = 1m,      // 1
            ["anomaly_weight"]   = 1m,      // 1
            ["policy_weight"]    = 1m,      // 1  — sum=4, equal weights
            ["confidence_min"]   = 0.6m
        });
        var agg = new WeightedAverageConfidenceAggregator(thresholds);
        var d = await agg.AggregateAsync(M(AiModuleNames.Ocr, 0.8m), M(AiModuleNames.Duplicate, 0.8m),
            M(AiModuleNames.Anomaly, 0.8m), M(AiModuleNames.Policy, 0.8m), CancellationToken.None);
        d.OverallConfidence.Should().Be(0.8000m);
    }
}
