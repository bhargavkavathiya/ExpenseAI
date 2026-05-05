using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Polly.CircuitBreaker;
using Polly.Timeout;
using Uc10.Application.Abstractions;
using Uc10.Application.Options;
using Uc10.Domain.Entities;
using Uc10.Infrastructure.Persistence;

namespace Uc10.Infrastructure.Ai.Gstin;

// Lookup GSTIN via a third-party API (configurable base URL + key). Registered
// with the "gstin" named HttpClient so Polly policies (retry + timeout +
// circuit breaker) wrap every call.
//
//   - Format is validated locally before any network call.
//   - Results are cached in `gstin_lookup_cache` with a TTL so popular vendors
//     are cheap to re-check.
//   - When no live provider is configured (Gstin:ApiBase/ApiKey empty) the
//     service runs in a deterministic demo mode: it parses the state from the
//     GSTIN prefix and synthesises a plausible "Active" result so the hackathon
//     UI still shows a sensible verification badge. The response is clearly
//     labelled `Status = "active (simulated)"` so it's never mistaken for a
//     real registry hit.
//   - FR-5.3 graceful degradation: on timeout / circuit-open / 4xx/5xx the
//     caller still gets a GstinLookupResult (Verified=false) — never throws.
public class HttpGstinLookupService : IGstinLookupService
{
    public const string HttpClientName = "gstin";

    // 15-char GSTIN: 2-digit state, 5-letter PAN prefix, 4-digit PAN digits,
    // 1-letter PAN suffix, 1 entity code (1-9 or A-Z), literal 'Z', 1 check.
    private static readonly Regex GstinPattern = new(
        @"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private readonly HttpClient _http;
    private readonly GstinOptions _opts;
    private readonly Uc10DbContext _db;
    private readonly IIntegrationStatusRepository _status;
    private readonly ILogger<HttpGstinLookupService> _log;

    public HttpGstinLookupService(HttpClient http, IOptions<GstinOptions> opts,
        Uc10DbContext db, IIntegrationStatusRepository status,
        ILogger<HttpGstinLookupService> log)
    {
        _http = http;
        _opts = opts.Value;
        _db = db;
        _status = status;
        _log = log;
        if (!string.IsNullOrWhiteSpace(_opts.ApiBase))
            _http.BaseAddress = new Uri(_opts.ApiBase);
        if (!string.IsNullOrWhiteSpace(_opts.ApiKey))
            _http.DefaultRequestHeaders.Add("x-api-key", _opts.ApiKey);
    }

    public async Task<GstinLookupResult> LookupAsync(string gstin, CancellationToken ct)
    {
        gstin = (gstin ?? "").Trim().ToUpperInvariant();

        // 1. Format validation — short-circuits before hitting any network.
        if (string.IsNullOrEmpty(gstin) || !GstinPattern.IsMatch(gstin))
        {
            return new GstinLookupResult(
                Gstin: gstin, Verified: false,
                LegalName: null, Status: "invalid_format", CircuitOpen: false);
        }

        // 2. Cache lookup (both live + demo results are cached).
        var cached = await _db.GstinCache.AsNoTracking().FirstOrDefaultAsync(c => c.Gstin == gstin, ct);
        if (cached is not null &&
            DateTimeOffset.UtcNow - cached.CachedAt < TimeSpan.FromSeconds(cached.TtlSeconds))
        {
            return new GstinLookupResult(
                Gstin: gstin,
                Verified: IsActive(cached.Status),
                LegalName: cached.LegalName,
                Status: cached.Status ?? "unknown",
                CircuitOpen: false);
        }

        // 3. Live call if API is configured.
        if (IsLiveConfigured())
            return await LiveLookupAsync(gstin, ct);

        // 4. Demo mode.
        return await DemoLookupAsync(gstin, ct);
    }

    private bool IsLiveConfigured() =>
        !string.IsNullOrWhiteSpace(_opts.ApiKey) &&
        !string.IsNullOrWhiteSpace(_opts.ApiBase) &&
        // Skip the placeholder host from .env.example so we don't actually call it.
        !_opts.ApiBase.Contains("example-gst.in", StringComparison.OrdinalIgnoreCase);

    private async Task<GstinLookupResult> LiveLookupAsync(string gstin, CancellationToken ct)
    {
        try
        {
            // sheet.gstincheck.co.in pattern: the API key is part of the path,
            // not a header. URL shape: `{base}/check/{api-key}/{gstin}`.
            var url = $"check/{Uri.EscapeDataString(_opts.ApiKey)}/{Uri.EscapeDataString(gstin)}";
            using var resp = await _http.GetAsync(url, ct);
            if (!resp.IsSuccessStatusCode)
            {
                await _status.RecordFailureAsync("gstin", $"HTTP {(int)resp.StatusCode}", ct);
                return new GstinLookupResult(gstin, Verified: false, LegalName: null,
                    Status: $"http_{(int)resp.StatusCode}", CircuitOpen: false);
            }

            var payload = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(payload);
            var root = doc.RootElement;

            // Provider returns `{ flag: true|false, message, data: { sts, lgnm, tradeNam, ... } }`.
            // `flag=false` means the key/GSTIN combination didn't resolve — treat as not-found.
            var flag = root.TryGetProperty("flag", out var f) &&
                       (f.ValueKind == JsonValueKind.True ||
                        (f.ValueKind == JsonValueKind.String && bool.TryParse(f.GetString(), out var b) && b));
            if (!flag)
            {
                var msg = TryGet(root, "message") ?? "not_found";
                await UpsertCache(gstin, null, msg, payload, ct);
                await _status.RecordSuccessAsync("gstin", ct);
                return new GstinLookupResult(gstin, Verified: false, LegalName: null,
                    Status: msg, CircuitOpen: false);
            }

            string? legalName = null;
            string providerStatus = "unknown";
            if (root.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object)
            {
                legalName = TryGet(data, "lgnm") ?? TryGet(data, "tradeNam");
                providerStatus = TryGet(data, "sts") ?? "unknown";
            }

            await UpsertCache(gstin, legalName, providerStatus, payload, ct);
            await _status.RecordSuccessAsync("gstin", ct);

            return new GstinLookupResult(
                Gstin: gstin,
                Verified: IsActive(providerStatus),
                LegalName: legalName,
                Status: providerStatus,
                CircuitOpen: false);
        }
        catch (BrokenCircuitException)
        {
            _log.LogWarning("GSTIN circuit open; degrading gracefully.");
            return new GstinLookupResult(gstin, Verified: false, LegalName: null,
                Status: "service_unavailable", CircuitOpen: true);
        }
        catch (TimeoutRejectedException)
        {
            await _status.RecordFailureAsync("gstin", "timeout", ct);
            return new GstinLookupResult(gstin, Verified: false, LegalName: null,
                Status: "timeout", CircuitOpen: false);
        }
        catch (Exception ex)
        {
            await _status.RecordFailureAsync("gstin", ex.GetType().Name, ct);
            _log.LogWarning(ex, "GSTIN lookup failed for {Gstin}", gstin);
            return new GstinLookupResult(gstin, Verified: false, LegalName: null,
                Status: "error", CircuitOpen: false);
        }
    }

    // Deterministic demo lookup — returns a believable response for any
    // well-formed GSTIN. The integration_status row is still updated (as
    // `up — simulated`) so the admin Integrations page reflects activity.
    private async Task<GstinLookupResult> DemoLookupAsync(string gstin, CancellationToken ct)
    {
        var stateCode = gstin[..2];
        var state = GstStateName(stateCode);
        var legalName = SynthesiseLegalName(gstin);
        var status = "active (simulated)";

        var payload = JsonSerializer.Serialize(new
        {
            gstin,
            lgnm = legalName,
            state_code = stateCode,
            state,
            sts = status,
            note = "Demo mode — configure Gstin:ApiBase + Gstin:ApiKey for live verification."
        });
        await UpsertCache(gstin, legalName, status, payload, ct);
        await _status.RecordSuccessAsync("gstin", ct);

        return new GstinLookupResult(
            Gstin: gstin,
            Verified: true,
            LegalName: legalName,
            Status: status,
            CircuitOpen: false);
    }

    private static bool IsActive(string? s) =>
        !string.IsNullOrWhiteSpace(s) &&
        s.StartsWith("active", StringComparison.OrdinalIgnoreCase);

    private static string? TryGet(JsonElement e, string key) =>
        e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    // Derive a plausible-looking legal name from the PAN embedded in the GSTIN
    // (chars 3-12). GSTIN 27AABCU9603R1ZX → PAN "AABCU9603R" → "AABCU VENTURES
    // PRIVATE LIMITED". Clearly synthetic so reviewers don't mistake it for
    // a real registry hit; the `(simulated)` status suffix reinforces that.
    private static string SynthesiseLegalName(string gstin)
    {
        var panPrefix = gstin.Substring(2, 5);
        return $"{panPrefix} VENTURES PRIVATE LIMITED";
    }

    // Indian GST state codes — covers all 36 states/UTs. Kept inline so the
    // demo mode has no external dependency.
    private static readonly Dictionary<string, string> StateNames = new()
    {
        ["01"] = "Jammu and Kashmir",   ["02"] = "Himachal Pradesh",  ["03"] = "Punjab",
        ["04"] = "Chandigarh",          ["05"] = "Uttarakhand",       ["06"] = "Haryana",
        ["07"] = "Delhi",               ["08"] = "Rajasthan",         ["09"] = "Uttar Pradesh",
        ["10"] = "Bihar",               ["11"] = "Sikkim",            ["12"] = "Arunachal Pradesh",
        ["13"] = "Nagaland",            ["14"] = "Manipur",           ["15"] = "Mizoram",
        ["16"] = "Tripura",             ["17"] = "Meghalaya",         ["18"] = "Assam",
        ["19"] = "West Bengal",         ["20"] = "Jharkhand",         ["21"] = "Odisha",
        ["22"] = "Chhattisgarh",        ["23"] = "Madhya Pradesh",    ["24"] = "Gujarat",
        ["25"] = "Daman and Diu",       ["26"] = "Dadra and Nagar Haveli",
        ["27"] = "Maharashtra",         ["28"] = "Andhra Pradesh (Old)",
        ["29"] = "Karnataka",           ["30"] = "Goa",               ["31"] = "Lakshadweep",
        ["32"] = "Kerala",              ["33"] = "Tamil Nadu",        ["34"] = "Puducherry",
        ["35"] = "Andaman and Nicobar", ["36"] = "Telangana",         ["37"] = "Andhra Pradesh",
        ["38"] = "Ladakh"
    };

    public static string? GstStateName(string code) =>
        StateNames.TryGetValue(code, out var name) ? name : null;

    private async Task UpsertCache(string gstin, string? legalName, string status, string payload, CancellationToken ct)
    {
        var existing = await _db.GstinCache.FirstOrDefaultAsync(c => c.Gstin == gstin, ct);
        if (existing is null)
        {
            _db.GstinCache.Add(new GstinCacheEntry
            {
                Gstin = gstin, LegalName = legalName, Status = status, Payload = payload,
                CachedAt = DateTimeOffset.UtcNow, TtlSeconds = 86_400
            });
        }
        else
        {
            existing.LegalName = legalName;
            existing.Status = status;
            existing.Payload = payload;
            existing.CachedAt = DateTimeOffset.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
    }
}
