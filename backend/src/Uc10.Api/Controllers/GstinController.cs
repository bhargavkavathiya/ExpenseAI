using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Uc10.Application.Abstractions;
using Uc10.Infrastructure.Ai.Gstin;

namespace Uc10.Api.Controllers;

// Response mirrors GstinLookupResult but adds the human-readable state name
// derived from the GSTIN prefix — convenient for the New Claim form to show
// "✓ Active · MAHARASHTRA · ACME VENTURES PRIVATE LIMITED".
public record GstinVerifyResponse(
    string Gstin,
    bool Verified,
    string Status,
    string? LegalName,
    string? StateCode,
    string? State,
    bool CircuitOpen);

[ApiController]
[Route("api/gstin")]
[Authorize]                 // any signed-in user can verify
public class GstinController : ControllerBase
{
    private readonly IGstinLookupService _lookup;

    public GstinController(IGstinLookupService lookup) => _lookup = lookup;

    // GET /api/gstin/{gstin} — inline verification used by the submit form as
    // the user types. Returns Status = "invalid_format" fast (no network) when
    // the input doesn't match the 15-char regex, so the UI can show an error
    // without waiting for the Polly timeout.
    [HttpGet("{gstin}")]
    [ProducesResponseType(typeof(GstinVerifyResponse), 200)]
    public async Task<GstinVerifyResponse> Verify(string gstin, CancellationToken ct)
    {
        var result = await _lookup.LookupAsync(gstin, ct);
        var stateCode = result.Gstin.Length >= 2 ? result.Gstin[..2] : null;
        return new GstinVerifyResponse(
            Gstin:      result.Gstin,
            Verified:   result.Verified,
            Status:     result.Status ?? "unknown",
            LegalName:  result.LegalName,
            StateCode:  stateCode,
            State:      stateCode is not null ? HttpGstinLookupService.GstStateName(stateCode) : null,
            CircuitOpen: result.CircuitOpen);
    }
}
