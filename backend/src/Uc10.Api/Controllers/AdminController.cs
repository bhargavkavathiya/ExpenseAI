using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Uc10.Application.Abstractions;
using Uc10.Application.Admin;
using Uc10.Application.Expenses;
using Uc10.Domain.Enums;

namespace Uc10.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "analyst,compliance,admin")]
public class AdminController : ControllerBase
{
    private readonly AdminDashboardService _dashboard;
    private readonly ReviewQueueService _review;
    private readonly ThresholdService _thresholds;
    private readonly PolicyRulesService _policies;
    private readonly AuditQueryService _audit;
    private readonly IntegrationsService _integrations;
    private readonly EmployeeBandsService _bands;
    private readonly ExpenseQueryService _expenses;
    private readonly IExpenseRepository _expenseRepo;

    public AdminController(
        AdminDashboardService dashboard, ReviewQueueService review, ThresholdService thresholds,
        PolicyRulesService policies, AuditQueryService audit, IntegrationsService integrations,
        EmployeeBandsService bands, ExpenseQueryService expenses, IExpenseRepository expenseRepo)
    {
        _dashboard = dashboard;
        _review = review;
        _thresholds = thresholds;
        _policies = policies;
        _audit = audit;
        _integrations = integrations;
        _bands = bands;
        _expenses = expenses;
        _expenseRepo = expenseRepo;
    }

    // ---------- dashboard ----------
    [HttpGet("dashboard")]
    public Task<DashboardResponse> Dashboard(CancellationToken ct) => _dashboard.GetAsync(ct);

    // ---------- review queue ----------
    [HttpGet("review-queue")]
    public async Task<IReadOnlyList<ReviewQueueItemDto>> ReviewQueue(
        [FromQuery] string? status, [FromQuery] int limit = 50, [FromQuery] int offset = 0, CancellationToken ct = default)
    {
        ReviewStatus? s = string.IsNullOrWhiteSpace(status) ? null : Enum.Parse<ReviewStatus>(status, true);
        var lim = Math.Clamp(limit, 1, 200);
        var off = Math.Max(0, offset);
        return await _review.GetAsync(s, lim, off, ct);
    }

    [HttpPost("review-queue/{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ReviewDecisionRequest? body, CancellationToken ct)
    {
        await _review.DecideAsync(id, ReviewStatus.Approved, RequireUserId(), body?.Note, ct);
        return NoContent();
    }

    [HttpPost("review-queue/{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] ReviewDecisionRequest? body, CancellationToken ct)
    {
        await _review.DecideAsync(id, ReviewStatus.Rejected, RequireUserId(), body?.Note, ct);
        return NoContent();
    }

    // ---------- admin expense detail (for the review-queue side drawer) ----------
    // Unlike /api/expenses/{refId}, this bypasses the per-user ownership filter so
    // analysts / compliance can inspect any claim.
    [HttpGet("expenses/{refId}")]
    [ProducesResponseType(typeof(ExpenseDecisionResponse), 200)]
    public async Task<ActionResult<ExpenseDecisionResponse>> GetExpense(string refId, CancellationToken ct)
    {
        var res = await _expenses.GetByRefIdAsync(refId, requestingUserId: null, ct);
        return res is null ? NotFound() : Ok(res);
    }

    // Streams the original uploaded receipt. Inline disposition so <img src> works.
    [HttpGet("expenses/{refId}/receipt")]
    public async Task<IActionResult> GetExpenseReceipt(string refId, CancellationToken ct)
    {
        var r = await _expenseRepo.GetReceiptRefAsync(refId, ct);
        if (r is null || !System.IO.File.Exists(r.StoragePath)) return NotFound();

        var contentType = r.ContentType;
        if (string.IsNullOrWhiteSpace(contentType) || contentType == "application/octet-stream")
        {
            if (!new FileExtensionContentTypeProvider().TryGetContentType(r.StoragePath, out contentType))
                contentType = "application/octet-stream";
        }
        var stream = System.IO.File.OpenRead(r.StoragePath);
        return File(stream, contentType);
    }

    // ---------- thresholds ----------
    [HttpGet("thresholds")]
    [Authorize(Roles = "compliance,admin")]
    public Task<IReadOnlyList<ThresholdDto>> Thresholds(CancellationToken ct) => _thresholds.GetAllAsync(ct);

    [HttpPut("thresholds/{key}")]
    [Authorize(Roles = "compliance,admin")]
    public async Task<IActionResult> UpdateThreshold(string key, [FromBody] UpdateThresholdRequest req, CancellationToken ct)
    {
        var newValue = await _thresholds.UpdateAsync(key, req.Value, RequireUserId(), ct);
        return Ok(new { key, value = newValue });
    }

    // ---------- policy rules ----------
    [HttpGet("policy-rules")]
    [Authorize(Roles = "compliance,admin")]
    public Task<IReadOnlyList<PolicyRuleDto>> PolicyRules(CancellationToken ct) => _policies.GetAllAsync(ct);

    [HttpPost("policy-rules")]
    [Authorize(Roles = "compliance,admin")]
    public async Task<ActionResult<PolicyRuleDto>> CreatePolicyRule([FromBody] PolicyRuleRequest req, CancellationToken ct)
    {
        var rule = await _policies.CreateAsync(req, RequireUserId(), ct);
        return Created($"/api/admin/policy-rules/{rule.Id}", rule);
    }

    [HttpPut("policy-rules/{id:guid}")]
    [Authorize(Roles = "compliance,admin")]
    public async Task<ActionResult<PolicyRuleDto>> UpdatePolicyRule(Guid id, [FromBody] PolicyRuleRequest req, CancellationToken ct) =>
        Ok(await _policies.UpdateAsync(id, req, RequireUserId(), ct));

    // ---------- audit logs ----------
    [HttpGet("audit-logs")]
    [Authorize(Roles = "compliance,admin")]
    public Task<IReadOnlyList<AuditLogRow>> AuditLogs(
        [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to,
        [FromQuery] string? module, [FromQuery] Guid? userId,
        [FromQuery] int limit = 100, [FromQuery] int offset = 0, CancellationToken ct = default) =>
        _audit.QueryAsync(from, to, module, userId, Math.Clamp(limit, 1, 1000), Math.Max(0, offset), ct);

    [HttpGet("audit-logs/export")]
    [Authorize(Roles = "compliance,admin")]
    public async Task<IActionResult> ExportAuditLogs(
        [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, CancellationToken ct)
    {
        var stream = await _audit.ExportCsvStreamAsync(from, to, ct);
        Response.Headers.ContentDisposition = $"attachment; filename=\"audit-logs-{DateTimeOffset.UtcNow:yyyyMMdd-HHmmss}.csv\"";
        return File(stream, "text/csv");
    }

    [HttpGet("audit-logs/verify-chain")]
    [Authorize(Roles = "compliance,admin")]
    public Task<AuditVerifyResponse> VerifyChain(CancellationToken ct) => _audit.VerifyChainAsync(ct);

    // ---------- integrations ----------
    [HttpGet("integrations")]
    public Task<IReadOnlyList<IntegrationDto>> Integrations(CancellationToken ct) => _integrations.GetAllAsync(ct);

    // ---------- employee-band allowances ----------
    [HttpGet("employee-bands")]
    [Authorize(Roles = "compliance,admin")]
    public Task<IReadOnlyList<EmployeeBandWithAllowancesDto>> Bands(CancellationToken ct) =>
        _bands.GetAllAsync(ct);

    [HttpPut("employee-bands")]
    [Authorize(Roles = "compliance,admin")]
    public Task<IReadOnlyList<EmployeeBandWithAllowancesDto>> UpdateBands(
        [FromBody] UpdateAllBandAllowancesRequest req, CancellationToken ct) =>
        _bands.UpdateAllAsync(req, RequireUserId(), ct);

    [HttpPost("employee-bands/reset")]
    [Authorize(Roles = "compliance,admin")]
    public Task<IReadOnlyList<EmployeeBandWithAllowancesDto>> ResetBands(CancellationToken ct) =>
        _bands.ResetToDefaultsAsync(RequireUserId(), ct);

    private Guid RequireUserId()
    {
        var sub = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(sub, out var id)) throw new UnauthorizedAccessException();
        return id;
    }
}
