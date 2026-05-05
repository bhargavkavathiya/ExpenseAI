using Uc10.Application.Abstractions;

namespace Uc10.Application.Expenses;

// Weighted-average aggregator.
//   OCR 0.3  Duplicate 0.2  Anomaly 0.2  Policy 0.3   (defaults; tunable via thresholds)
// Routes below `confidence_min` (default 0.6) to review. Any hard policy violation
// (severity=high) forces needs_review regardless of aggregate.
public class WeightedAverageConfidenceAggregator : IConfidenceAggregator
{
    private readonly IThresholdRepository _thresholds;

    public WeightedAverageConfidenceAggregator(IThresholdRepository thresholds) => _thresholds = thresholds;

    public async Task<AggregatedDecision> AggregateAsync(
        ModuleScore ocr, ModuleScore duplicate, ModuleScore anomaly, ModuleScore policy,
        CancellationToken ct)
    {
        var all = await _thresholds.GetAllAsync(ct);
        decimal Get(string key, decimal d) => all.TryGetValue(key, out var v) ? v : d;

        var wOcr  = Get("ocr_weight",       0.30m);
        var wDup  = Get("duplicate_weight", 0.20m);
        var wAnom = Get("anomaly_weight",   0.20m);
        var wPol  = Get("policy_weight",    0.30m);
        var sumW  = wOcr + wDup + wAnom + wPol;
        if (sumW <= 0) sumW = 1m;

        var overall = (ocr.Score * wOcr + duplicate.Score * wDup + anomaly.Score * wAnom + policy.Score * wPol) / sumW;
        overall = Math.Clamp(Math.Round(overall, 4, MidpointRounding.AwayFromZero), 0m, 1m);

        var minConf = Get("confidence_min", 0.60m);

        // Hard-override signals:
        //   - any policy violation with high severity → needs_review
        //   - duplicate score below 0.3 → rejected (strong duplicate signal)
        var needsReview = false;
        var status = "approved";
        string? reason = null;

        if (duplicate.Score <= 0.3m)
        {
            status = "rejected";
            reason = "likely duplicate receipt";
        }
        else if (overall < minConf)
        {
            status = "needs_review";
            needsReview = true;
            reason = $"overall confidence {overall:0.00} below threshold {minConf:0.00}";
        }
        else if (policy.Details.TryGetValue("high_severity_violations", out var hv) &&
                 hv is int n && n > 0)
        {
            status = "needs_review";
            needsReview = true;
            reason = "high-severity policy violation(s)";
        }

        return new AggregatedDecision(overall, needsReview || status == "needs_review", reason, status);
    }
}
