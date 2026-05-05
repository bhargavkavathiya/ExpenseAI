using System.Text.Json;
using Uc10.Application.Abstractions;
using Uc10.Domain.Entities;
using Uc10.Domain.Enums;

namespace Uc10.Application.Expenses;

public class ExpenseQueryService
{
    private readonly IExpenseRepository _expenses;
    private readonly IUserRepository _users;
    private readonly IEmployeeBandRepository _bands;
    private readonly IThresholdRepository _thresholds;

    public ExpenseQueryService(
        IExpenseRepository expenses, IUserRepository users,
        IEmployeeBandRepository bands, IThresholdRepository thresholds)
    {
        _expenses = expenses;
        _users = users;
        _bands = bands;
        _thresholds = thresholds;
    }

    public async Task<ExpenseDecisionResponse?> GetByRefIdAsync(string refId, Guid? requestingUserId, CancellationToken ct)
    {
        var exp = await _expenses.GetByRefIdAsync(refId, ct);
        if (exp is null) return null;
        if (requestingUserId is Guid u && exp.UserId != u) return null; // 404-equivalent for non-owners

        var user = await _users.FindByIdAsync(exp.UserId, ct);
        var band = user?.Band is { Length: > 0 } code ? await _bands.GetByCodeAsync(code, ct) : null;
        var thresholds = await _thresholds.GetAllAsync(ct);

        return Map(exp, user, band, thresholds);
    }

    public async Task<IReadOnlyList<ExpenseSummaryDto>> GetRecentAsync(Guid userId, int limit, CancellationToken ct)
    {
        var list = await _expenses.GetRecentForUserAsync(userId, limit, ct);
        return list.Select(e =>
        {
            var (vendor, total, currency) = ExtractHeadline(e.Result);
            return new ExpenseSummaryDto(
                e.RefId, StatusString(e.Status), e.SubmittedAt, e.OverallConfidence,
                vendor ?? e.Category, total, currency,
                e.Category, e.ClaimedAmount);
        }).ToList();
    }

    private static ExpenseDecisionResponse Map(Expense e, User? user, EmployeeBand? band,
        IReadOnlyDictionary<string, decimal> thresholds)
    {
        ExpenseResultDto? r = null;
        if (!string.IsNullOrEmpty(e.Result))
        {
            try
            {
                using var doc = JsonDocument.Parse(e.Result);
                var root = doc.RootElement;
                r = new ExpenseResultDto(
                    Vendor: root.TryGetProperty("vendor", out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null,
                    Gstin:  root.TryGetProperty("gstin",  out var g) && g.ValueKind == JsonValueKind.String ? g.GetString() : null,
                    GstinVerified: ReadNullableBool(root, "gstin_verified"),
                    Date:   root.TryGetProperty("date", out var d) && d.ValueKind == JsonValueKind.String && DateOnly.TryParse(d.GetString(), out var dt) ? dt : null,
                    Total:  root.TryGetProperty("total", out var t) && t.ValueKind == JsonValueKind.Number ? t.GetDecimal() : null,
                    Currency: root.TryGetProperty("currency", out var c) && c.ValueKind == JsonValueKind.String ? (c.GetString() ?? "INR") : "INR",
                    Items:  Array.Empty<ReceiptItemDto>(),
                    OverallConfidence: e.OverallConfidence ?? 0m,
                    DecisionStatus: root.TryGetProperty("decision_status", out var ds) && ds.ValueKind == JsonValueKind.String ? ds.GetString()! : StatusString(e.Status),
                    Explanation: null,
                    PerModule: MapPerModule(root),
                    NeedsReview: e.NeedsReview,
                    ReviewReason: e.ReviewReason);
            }
            catch { r = null; }
        }

        var findings = BuildFindings(e, r, band, thresholds);
        var modules = BuildModulesExecuted(r);

        return new ExpenseDecisionResponse(
            RefId: e.RefId,
            Status: StatusString(e.Status),
            SubmittedAt: e.SubmittedAt,
            CompletedAt: e.CompletedAt,
            OverallConfidence: e.OverallConfidence,
            NeedsReview: e.NeedsReview,
            ReviewReason: e.ReviewReason,
            Category: e.Category,
            PaymentMode: e.PaymentMode,
            Purpose: e.Purpose,
            City: e.City,
            ClaimedAmount:   e.ClaimedAmount,
            ClaimedDate:     e.ClaimedDate?.ToString("yyyy-MM-dd"),
            ClaimedMerchant: e.ClaimedMerchant,
            ClaimedGstin:    e.ClaimedGstin,
            EmployeeName:    e.EmployeeName ?? user?.FullName,
            Department:      e.Department   ?? user?.Department,
            Result: r,
            Findings: findings,
            ModulesExecuted: modules);
    }

    // Synthesise the human-readable audit findings rendered as coloured cards
    // on the decision summary page. Pulls from:
    //   * claimed-vs-OCR diffs (amount, merchant)
    //   * global thresholds (cash review)
    //   * the user's band allowance (category/daily/mgr-review caps)
    //   * policy rule violations from the per-module policy output
    //   * score-based signals (duplicate, anomaly, low OCR confidence)
    private static IReadOnlyList<FindingDto> BuildFindings(
        Expense exp, ExpenseResultDto? result, EmployeeBand? band,
        IReadOnlyDictionary<string, decimal> thresholds)
    {
        var findings = new List<FindingDto>();
        var amount = exp.ClaimedAmount ?? result?.Total ?? 0m;
        var category = exp.Category ?? result?.Vendor ?? "expense";
        var payment = exp.PaymentMode ?? "";

        // Claimed-vs-extracted consistency (audit integrity signal).
        if (exp.ClaimedAmount is decimal claimed && result?.Total is decimal ocrTotal &&
            Math.Abs(claimed - ocrTotal) / Math.Max(claimed, 1m) > 0.05m)
        {
            findings.Add(new("warn",
                $"Claimed amount ₹{FmtInr(claimed)} differs from receipt OCR ₹{FmtInr(ocrTotal)} by more than 5%"));
        }
        if (!string.IsNullOrWhiteSpace(exp.ClaimedMerchant) && !string.IsNullOrWhiteSpace(result?.Vendor) &&
            !exp.ClaimedMerchant.Equals(result.Vendor, StringComparison.OrdinalIgnoreCase))
        {
            findings.Add(new("info",
                $"Claimed merchant '{exp.ClaimedMerchant}' does not match OCR vendor '{result.Vendor}'"));
        }

        // GSTIN cross-check — when the employee entered a GSTIN at submit time
        // and OCR also extracted one from the bill, compare them. A mismatch is
        // a strong audit signal: someone is either typing the wrong number or
        // the receipt is for a different vendor than claimed. Both values are
        // normalised to uppercase 15-char strings before comparison.
        var claimedGstin = NormalizeGstin(exp.ClaimedGstin);
        var ocrGstin     = NormalizeGstin(result?.Gstin);
        if (claimedGstin is not null && ocrGstin is not null &&
            !string.Equals(claimedGstin, ocrGstin, StringComparison.Ordinal))
        {
            findings.Add(new("error",
                $"Claimed GSTIN '{claimedGstin}' does not match OCR-extracted GSTIN '{ocrGstin}'"));
        }
        else if (claimedGstin is not null && ocrGstin is null && result is not null)
        {
            // Receipt was OCR'd but no GSTIN visible on it — useful info, not blocking.
            findings.Add(new("info",
                $"Claimed GSTIN '{claimedGstin}' could not be cross-verified — receipt OCR did not detect a GSTIN."));
        }
        else if (claimedGstin is not null && ocrGstin is not null &&
                 string.Equals(claimedGstin, ocrGstin, StringComparison.Ordinal) &&
                 result?.GstinVerified == true)
        {
            // Positive signal — GSTIN matches OCR AND the registry says it's active.
            findings.Add(new("info", $"GSTIN '{claimedGstin}' matches receipt OCR and is verified active in GST registry."));
        }

        // Global cash-review threshold.
        if (thresholds.TryGetValue("policy_amount_cap_inr", out var globalCap) && amount > globalCap)
            findings.Add(new("warn",
                $"{category} expense ₹{FmtInr(amount)} exceeds global policy limit of ₹{FmtInr(globalCap)}"));

        // Band-specific limits derived from allowances JSONB.
        if (band is not null && amount > 0m)
        {
            var allowances = TryParseAllowances(band.Allowances);
            var (capKey, capLabel) = exp.Category?.ToLowerInvariant() switch
            {
                "meals"  => ("meals_limit", "meals"),
                "hotel"  => ("hotel_limit", "hotel"),
                "fuel"   => ("fuel_limit", "fuel"),
                _        => ("", "")
            };
            if (capKey.Length > 0 && allowances.TryGetValue(capKey, out var cap) && amount > cap)
                findings.Add(new("error",
                    $"{Capitalize(capLabel)} expense ₹{FmtInr(amount)} exceeds band {band.Code} limit of ₹{FmtInr(cap)}"));

            if (allowances.TryGetValue("daily_limit", out var daily) && daily > 0 && amount > daily)
                findings.Add(new("warn",
                    $"Claim ₹{FmtInr(amount)} exceeds band {band.Code} daily limit of ₹{FmtInr(daily)}"));

            if (allowances.TryGetValue("mgr_review_threshold", out var mgr) && mgr > 0 && amount > mgr)
                findings.Add(new("info",
                    $"Amount ₹{FmtInr(amount)} exceeds manager review threshold of ₹{FmtInr(mgr)} for band {band.Code}"));
        }

        // Cash payment review-threshold (global).
        if (string.Equals(payment, "Cash", StringComparison.OrdinalIgnoreCase) &&
            amount > 0m && amount > 3_000m)
            findings.Add(new("warn",
                $"Cash payment of ₹{FmtInr(amount)} exceeds review threshold of ₹3,000"));

        // Policy violations already computed by the policy module.
        if (result?.PerModule?.Policy?.Details is JsonElement je &&
            je.ValueKind == JsonValueKind.Object &&
            je.TryGetProperty("violations", out var viols) &&
            viols.ValueKind == JsonValueKind.Array)
        {
            foreach (var v in viols.EnumerateArray())
            {
                if (v.ValueKind != JsonValueKind.Object) continue;
                if (!v.TryGetProperty("violated", out var viol) || viol.ValueKind != JsonValueKind.True) continue;
                var reason = v.TryGetProperty("reason", out var rs) && rs.ValueKind == JsonValueKind.String ? rs.GetString() : "policy violation";
                var severity = v.TryGetProperty("severity", out var sev) && sev.ValueKind == JsonValueKind.String ? (sev.GetString() ?? "medium") : "medium";
                findings.Add(new(MapSeverity(severity), reason ?? "policy violation"));
            }
        }

        // Module-score-based signals.
        if (result?.PerModule?.Duplicate is { } dup && dup.Score <= 0.3m)
            findings.Add(new("error", "Strong duplicate signal — this receipt resembles a prior submission."));
        if (result?.PerModule?.Anomaly is { } an && an.Score <= 0.5m)
            findings.Add(new("warn", "Anomaly detector flagged the amount as out-of-pattern."));
        if (result?.PerModule?.Ocr is { } ocr && ocr.Score < 0.6m)
            findings.Add(new("info", $"OCR confidence {Math.Round(ocr.Score * 100)}% — some fields may need manual verification."));

        return findings;
    }

    private static IReadOnlyList<ModuleExecutionDto> BuildModulesExecuted(ExpenseResultDto? result)
    {
        var list = new List<ModuleExecutionDto>();
        if (result is null)
        {
            list.Add(new("OCR Extraction",     "skipped"));
            list.Add(new("Duplicate Detection","skipped"));
            list.Add(new("Anomaly Detection",  "skipped"));
            list.Add(new("Policy Rule Engine", "skipped"));
            list.Add(new("GST Lookup",         "skipped"));
            list.Add(new("Fraud Indicators",   "skipped"));
            return list;
        }
        list.Add(new("OCR Extraction",      Score(result.PerModule?.Ocr?.Score)));
        list.Add(new("Duplicate Detection", Score(result.PerModule?.Duplicate?.Score)));
        list.Add(new("Anomaly Detection",   Score(result.PerModule?.Anomaly?.Score)));
        list.Add(new("Policy Rule Engine",  Score(result.PerModule?.Policy?.Score)));
        list.Add(new("GST Lookup",          result.GstinVerified switch { true => "ok", false => "failed", _ => "skipped" }));
        list.Add(new("Fraud Indicators",    result.PerModule?.Duplicate?.Score <= 0.3m ? "warn" : "ok"));
        return list;
    }

    private static string Score(decimal? s) => s switch
    {
        null             => "skipped",
        >= 0.8m          => "ok",
        >= 0.5m          => "warn",
        _                => "failed"
    };

    private static Dictionary<string, decimal> TryParseAllowances(string json)
    {
        var dict = new Dictionary<string, decimal>();
        try
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var kv in doc.RootElement.EnumerateObject())
                if (kv.Value.ValueKind == JsonValueKind.Number)
                    dict[kv.Name] = kv.Value.GetDecimal();
        }
        catch { }
        return dict;
    }

    // Cached — GetCultureInfo throws on ICU-less runtimes (e.g. alpine with
    // globalization-invariant mode on). Fall back to InvariantCulture so a
    // misconfigured container still serves the page instead of 500-ing.
    private static readonly System.Globalization.CultureInfo _inrCulture = ResolveInrCulture();
    private static System.Globalization.CultureInfo ResolveInrCulture()
    {
        try { return System.Globalization.CultureInfo.GetCultureInfo("en-IN"); }
        catch { return System.Globalization.CultureInfo.InvariantCulture; }
    }
    private static string FmtInr(decimal n) => n.ToString("N0", _inrCulture);
    private static string Capitalize(string s) => string.IsNullOrEmpty(s) ? "" : char.ToUpperInvariant(s[0]) + s[1..];

    // Normalise a GSTIN to a comparable canonical form: uppercase, no spaces,
    // exactly 15 chars. Returns null for anything else so callers can skip
    // comparison cleanly.
    private static string? NormalizeGstin(string? gstin)
    {
        if (string.IsNullOrWhiteSpace(gstin)) return null;
        var g = gstin.Trim().ToUpperInvariant().Replace(" ", "");
        return g.Length == 15 ? g : null;
    }

    private static string MapSeverity(string sev) => sev.ToLowerInvariant() switch
    {
        "high"   => "error",
        "medium" => "warn",
        _        => "info"
    };

    private static bool? ReadNullableBool(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.True  => true,
            JsonValueKind.False => false,
            _                   => null
        };
    }

    private static PerModuleDto MapPerModule(JsonElement root)
    {
        static ModuleResultDto M(JsonElement j) => new(
            ModelVersion:  j.TryGetProperty("model_version", out var mv) && mv.ValueKind == JsonValueKind.String ? mv.GetString()! : "unknown",
            PromptVersion: j.TryGetProperty("prompt_version", out var pv) && pv.ValueKind == JsonValueKind.String ? pv.GetString() : null,
            Score:         j.TryGetProperty("score", out var sc) && sc.ValueKind == JsonValueKind.Number ? sc.GetDecimal() : 0m,
            Summary:       j.TryGetProperty("summary", out var s)  && s.ValueKind  == JsonValueKind.String ? s.GetString() : null,
            Details:       j.TryGetProperty("details", out var de) ? (object)de.Clone() : null);

        var pm = root.TryGetProperty("per_module", out var p) ? p : default;
        var empty = new ModuleResultDto("none", null, 0m, null, null);
        return new PerModuleDto(
            pm.ValueKind == JsonValueKind.Object && pm.TryGetProperty("ocr",       out var o) ? M(o) : empty,
            pm.ValueKind == JsonValueKind.Object && pm.TryGetProperty("duplicate", out var d) ? M(d) : empty,
            pm.ValueKind == JsonValueKind.Object && pm.TryGetProperty("anomaly",   out var a) ? M(a) : empty,
            pm.ValueKind == JsonValueKind.Object && pm.TryGetProperty("policy",    out var q) ? M(q) : empty);
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

    private static string StatusString(ExpenseStatus s) => s switch
    {
        ExpenseStatus.Processing    => "processing",
        ExpenseStatus.Approved      => "approved",
        ExpenseStatus.NeedsReview   => "needs_review",
        ExpenseStatus.Rejected      => "rejected",
        ExpenseStatus.Failed        => "failed",
        _                           => s.ToString().ToLowerInvariant()
    };
}
