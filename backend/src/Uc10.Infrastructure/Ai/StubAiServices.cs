using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Uc10.Application.Abstractions;
using Uc10.Domain.Enums;

namespace Uc10.Infrastructure.Ai;

// Deterministic stubs so the end-to-end demo runs without any external services
// (no OPENAI_API_KEY, no GSTIN provider). Each stub returns a believable but
// flat response plus a ModuleScore in the shape the real impl would emit.

public class StubOcrExtractionService : IOcrExtractionService
{
    private readonly ILogger<StubOcrExtractionService>? _log;
    public StubOcrExtractionService(ILogger<StubOcrExtractionService>? log = null) => _log = log;

    public Task<OcrExtraction> ExtractAsync(string storagePath, CancellationToken ct)
    {
        // Loud warning whenever this fires — the canned "DEMO VENDOR (stub)" /
        // ₹1234 result is a frequent source of "why is my real OpenAI not
        // working?" support reports. If you see this in logs, OpenAI__ApiKey
        // was empty/whitespace at startup; the key must be in process env
        // before WebApplication.CreateBuilder runs.
        _log?.LogWarning("StubOcrExtractionService.ExtractAsync called — returning canned 'DEMO VENDOR (stub)' result. " +
                         "This means OpenAI__ApiKey was not configured at app start. Restart the API after fixing .env.");

        var score = new ModuleScore(
            Module: AiModuleNames.Ocr,
            ModelVersion: "stub_v0.0.0",
            PromptVersion: "ocr_v1.0.0",
            Score: 0.90m,
            Summary: "Stub OCR produced synthetic fields; wire OpenAI key to enable real extraction.",
            Details: new Dictionary<string, object?>
            {
                ["source"] = "stub",
                ["storage_path"] = storagePath,
                ["per_field_confidence"] = new { vendor = 0.9, gstin = 0.8, date = 0.9, total = 0.95 }
            });

        var result = new OcrExtraction(
            Vendor: "DEMO VENDOR (stub)",
            Gstin:  "29ABCDE1234F1Z5",
            Date:   DateOnly.FromDateTime(DateTime.UtcNow),
            Total:  1234.00m,
            Currency: "INR",
            Items: new List<ReceiptLineItem>
            {
                new("Demo line item", 1m, 1234.00m, 1234.00m)
            },
            Score: score);

        return Task.FromResult(result);
    }
}

public class StubDuplicateDetectionService : IDuplicateDetectionService
{
    private readonly IDuplicateHashRepository _phashes;
    private readonly IThresholdRepository _thresholds;

    public StubDuplicateDetectionService(IDuplicateHashRepository phashes, IThresholdRepository thresholds)
    {
        _phashes = phashes;
        _thresholds = thresholds;
    }

    public async Task<ModuleScore> CheckAsync(DuplicateCheckInput input, CancellationToken ct)
    {
        var all = await _thresholds.GetAllAsync(ct);
        var hamming = all.TryGetValue("duplicate_hamming",       out var h)  ? (int)h  : 8;
        var window  = all.TryGetValue("duplicate_window_days",   out var wd) ? (int)wd : 90;

        var min = await _phashes.MinHammingDistanceAsync(input.UserId, input.PHash, window, ct);
        var duplicate = min is int d && d < hamming;

        var score = duplicate ? 0.10m : 1.00m;
        return new ModuleScore(
            Module: AiModuleNames.Duplicate,
            ModelVersion: "phash_v1.0.0",
            PromptVersion: null,
            Score: score,
            Summary: duplicate
                ? $"Receipt image is similar to a prior upload (min Hamming = {min})."
                : "No close match among recent uploads.",
            Details: new Dictionary<string, object?>
            {
                ["min_hamming"]        = (object?)min ?? "none",
                ["hamming_threshold"]  = hamming,
                ["window_days"]        = window,
                ["duplicate"]          = duplicate
            });
    }
}

public class StubAnomalyDetectionService : IAnomalyDetectionService
{
    public Task<ModuleScore> CheckAsync(AnomalyCheckInput input, CancellationToken ct)
    {
        // z-score against a synthetic seed distribution (mean 1500, stddev 700).
        const decimal mean = 1500m;
        const decimal stddev = 700m;
        var z = Math.Abs(input.Amount - mean) / stddev;

        // Map |z| to a "within pattern" probability — 0 at z=0 is perfect, z=3 is ~0.1.
        var clamped = Math.Min(z, 3m);
        var score = Math.Round(1m - (clamped / 3m) * 0.9m, 4);

        return Task.FromResult(new ModuleScore(
            Module: AiModuleNames.Anomaly,
            ModelVersion: "zscore_v1.0.0",
            PromptVersion: null,
            Score: score,
            Summary: z > 2m ? "Amount is unusual for this user/population." : "Amount is within typical range.",
            Details: new Dictionary<string, object?>
            {
                ["amount"] = input.Amount,
                ["z_score"] = z,
                ["reference_mean"] = mean,
                ["reference_stddev"] = stddev,
                ["source"] = "seed_fixture"
            }));
    }
}

public class StubPolicyRuleEngine : IPolicyRuleEngine
{
    private readonly IPolicyRuleRepository _rules;
    private readonly IThresholdRepository _thresholds;
    private readonly ILogger<StubPolicyRuleEngine> _log;

    public StubPolicyRuleEngine(IPolicyRuleRepository rules, IThresholdRepository thresholds, ILogger<StubPolicyRuleEngine> log)
    {
        _rules = rules;
        _thresholds = thresholds;
        _log = log;
    }

    public async Task<PolicyEvaluationResult> EvaluateAsync(PolicyEvaluationInput input, CancellationToken ct)
    {
        var rules = await _rules.GetActiveAsync(ct);
        var violations = new List<PolicyViolation>();
        var highSev = 0;

        foreach (var rule in rules)
        {
            PolicyViolation? v = null;
            try
            {
                v = rule.Type switch
                {
                    PolicyRuleType.AmountCap     => CheckAmountCap(rule, input),
                    PolicyRuleType.RequireGstin  => CheckRequireGstin(rule, input),
                    PolicyRuleType.CategoryBlock => CheckCategoryBlock(rule, input),
                    PolicyRuleType.TimeWindow    => CheckTimeWindow(rule, input),
                    PolicyRuleType.Fuzzy         => null,   // stub skips fuzzy (needs LLM)
                    _                             => null
                };
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "policy rule {Code} evaluation error", rule.Code);
            }

            if (v is not null && v.Violated)
            {
                violations.Add(v);
                if (rule.Severity == "high") highSev++;
            }
        }

        var noViolScore = Math.Round(1m - Math.Min(1m, 0.25m * violations.Count), 4);
        var score = new ModuleScore(
            Module: AiModuleNames.Policy,
            ModelVersion: "deterministic_v1.0.0",
            PromptVersion: "policy_v1.0.0",
            Score: noViolScore,
            Summary: violations.Count == 0 ? "No policy violations detected." : $"{violations.Count} policy violation(s).",
            Details: new Dictionary<string, object?>
            {
                ["violations"] = violations,
                ["rule_count"] = rules.Count,
                ["high_severity_violations"] = highSev
            });

        return new PolicyEvaluationResult(violations, score);
    }

    private static PolicyViolation? CheckAmountCap(Domain.Entities.PolicyRule rule, PolicyEvaluationInput input)
    {
        if (input.Amount is null) return null;
        var cap = ReadDecimal(rule.Params, "cap_inr");
        if (cap is null) return null;
        return new PolicyViolation(rule.Code, rule.Name, input.Amount > cap.Value,
            input.Amount > cap.Value ? $"{input.Amount:0.00} > cap {cap:0.00}" : "within cap",
            rule.Severity, 1.0m);
    }

    private static PolicyViolation? CheckRequireGstin(Domain.Entities.PolicyRule rule, PolicyEvaluationInput input)
    {
        if (input.Amount is null) return null;
        var min = ReadDecimal(rule.Params, "min_amount_inr");
        if (min is null) return null;
        if (input.Amount < min.Value) return null;
        var ok = !string.IsNullOrWhiteSpace(input.Gstin) && input.Gstin!.Length == 15;
        return new PolicyViolation(rule.Code, rule.Name, !ok,
            ok ? "GSTIN present" : "GSTIN missing or invalid for high-value receipt",
            rule.Severity, 1.0m);
    }

    private static PolicyViolation? CheckCategoryBlock(Domain.Entities.PolicyRule rule, PolicyEvaluationInput input)
    {
        var category = input.CategoryHint?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(category)) return null;
        var blocked = ReadStringArray(rule.Params, "blocked_categories");
        var bad = blocked.Any(b => string.Equals(b, category, StringComparison.OrdinalIgnoreCase));
        return new PolicyViolation(rule.Code, rule.Name, bad,
            bad ? $"category '{category}' is blocked" : "category allowed",
            rule.Severity, 1.0m);
    }

    private static PolicyViolation? CheckTimeWindow(Domain.Entities.PolicyRule rule, PolicyEvaluationInput input)
    {
        if (input.Date is null) return null;
        // Date-only rules can't determine hour; treat as informational pass.
        return new PolicyViolation(rule.Code, rule.Name, false,
            "time-window check skipped (date-only receipt)", rule.Severity, 0.6m);
    }

    private static decimal? ReadDecimal(string json, string key)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number)
                return v.GetDecimal();
        }
        catch { }
        return null;
    }

    private static string[] ReadStringArray(string json, string key)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Array)
                return v.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToArray();
        }
        catch { }
        return Array.Empty<string>();
    }
}

public class StubGstinLookupService : IGstinLookupService
{
    public Task<GstinLookupResult> LookupAsync(string gstin, CancellationToken ct) =>
        Task.FromResult(new GstinLookupResult(gstin, Verified: true, LegalName: "DEMO VENDOR PVT LTD",
            Status: "active", CircuitOpen: false));
}

// Minimal local pHash: SHA-256 of file bytes, take first 16 hex chars. NOT a real
// perceptual hash — good enough for the stub so the duplicate repository has
// something to compare. Real pHash is wired in Phase 6 via CoenM.ImageHash.
public class StubPerceptualHasher : IPerceptualHasher
{
    public async Task<string> HashAsync(string storagePath, CancellationToken ct)
    {
        using var sha = System.Security.Cryptography.SHA256.Create();
        await using var fs = File.OpenRead(storagePath);
        var bytes = await sha.ComputeHashAsync(fs, ct);
        return Convert.ToHexString(bytes).ToLowerInvariant()[..16];
    }
}

// Simple PolicyRule repository kept here to avoid a third Persistence file for now.
public class PolicyRuleRepository : IPolicyRuleRepository
{
    private readonly Uc10.Infrastructure.Persistence.Uc10DbContext _db;
    public PolicyRuleRepository(Uc10.Infrastructure.Persistence.Uc10DbContext db) => _db = db;

    public async Task<IReadOnlyList<Domain.Entities.PolicyRule>> GetActiveAsync(CancellationToken ct) =>
        await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToListAsync(
            _db.PolicyRules.AsNoTracking().Where(r => r.Active), ct);

    public async Task<IReadOnlyList<Domain.Entities.PolicyRule>> GetAllAsync(CancellationToken ct) =>
        await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToListAsync(
            _db.PolicyRules.AsNoTracking().OrderBy(r => r.Code), ct);

    public Task<Domain.Entities.PolicyRule?> GetByIdAsync(Guid id, CancellationToken ct) =>
        Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.FirstOrDefaultAsync(
            _db.PolicyRules.AsNoTracking(), r => r.Id == id, ct);

    public async Task<Domain.Entities.PolicyRule> CreateAsync(Domain.Entities.PolicyRule rule, Guid updatedBy, CancellationToken ct)
    {
        rule.Id = rule.Id == Guid.Empty ? Guid.NewGuid() : rule.Id;
        rule.UpdatedBy = updatedBy;
        rule.UpdatedAt = DateTimeOffset.UtcNow;
        _db.PolicyRules.Add(rule);
        await _db.SaveChangesAsync(ct);
        return rule;
    }

    public async Task<Domain.Entities.PolicyRule> UpdateAsync(Guid id, Domain.Entities.PolicyRule rule, Guid updatedBy, CancellationToken ct)
    {
        var row = await _db.PolicyRules.FirstOrDefaultAsync(r => r.Id == id, ct)
                  ?? throw new KeyNotFoundException($"policy rule {id} not found");
        row.Name        = rule.Name;
        row.Description = rule.Description;
        row.Type        = rule.Type;
        row.Params      = rule.Params;
        row.Active      = rule.Active;
        row.Severity    = rule.Severity;
        row.UpdatedBy   = updatedBy;
        row.UpdatedAt   = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
        return row;
    }
}

// Integration status (simple; used by /api/admin/integrations).
public class IntegrationStatusRepository : IIntegrationStatusRepository
{
    private readonly Uc10.Infrastructure.Persistence.Uc10DbContext _db;
    public IntegrationStatusRepository(Uc10.Infrastructure.Persistence.Uc10DbContext db) => _db = db;

    public async Task<IReadOnlyList<Domain.Entities.IntegrationStatus>> GetAllAsync(CancellationToken ct) =>
        await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToListAsync(
            _db.IntegrationStatuses.AsNoTracking().OrderBy(x => x.Name), ct);

    public async Task RecordSuccessAsync(string name, CancellationToken ct)
    {
        var row = await _db.IntegrationStatuses.FirstOrDefaultAsync(x => x.Name == name, ct);
        if (row is null)
        {
            _db.IntegrationStatuses.Add(new Domain.Entities.IntegrationStatus
            {
                Id = Guid.NewGuid(), Name = name, Health = IntegrationHealth.Up,
                LastChecked = DateTimeOffset.UtcNow, CircuitState = CircuitState.Closed,
                UpdatedAt = DateTimeOffset.UtcNow
            });
        }
        else
        {
            row.Health = IntegrationHealth.Up;
            row.LastChecked = DateTimeOffset.UtcNow;
            row.LastError = null;
            row.ConsecutiveFailures = 0;
            row.CircuitState = CircuitState.Closed;
            row.UpdatedAt = DateTimeOffset.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
    }

    public async Task RecordFailureAsync(string name, string error, CancellationToken ct)
    {
        var row = await _db.IntegrationStatuses.FirstOrDefaultAsync(x => x.Name == name, ct);
        if (row is null)
        {
            _db.IntegrationStatuses.Add(new Domain.Entities.IntegrationStatus
            {
                Id = Guid.NewGuid(), Name = name, Health = IntegrationHealth.Down,
                LastChecked = DateTimeOffset.UtcNow, LastError = error, ConsecutiveFailures = 1,
                CircuitState = CircuitState.Closed, UpdatedAt = DateTimeOffset.UtcNow
            });
        }
        else
        {
            row.Health = IntegrationHealth.Down;
            row.LastChecked = DateTimeOffset.UtcNow;
            row.LastError = error;
            row.ConsecutiveFailures += 1;
            row.UpdatedAt = DateTimeOffset.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
    }
}
