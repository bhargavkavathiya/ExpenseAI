using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Uc10.Application.Abstractions;
using Uc10.Application.Expenses;

namespace Uc10.Api.Controllers;

[ApiController]
[Route("api/expenses")]
[Authorize]
public class ExpensesController : ControllerBase
{
    private readonly ExpenseSubmissionService _submit;
    private readonly ExpenseQueryService _query;
    private readonly IOcrExtractionService _ocr;
    private readonly IExpenseRepository _expenseRepo;

    public ExpensesController(ExpenseSubmissionService submit, ExpenseQueryService query,
        IOcrExtractionService ocr, IExpenseRepository expenseRepo)
    {
        _submit = submit;
        _query = query;
        _ocr = ocr;
        _expenseRepo = expenseRepo;
    }

    // POST /api/expenses — multipart receipt upload with optional metadata fields:
    //   receipt (file) + category, paymentMode, purpose, city,
    //   claimedAmount, claimedDate, claimedMerchant, claimedGstin,
    //   employeeName, department.
    // Returns { refId, status="processing" }.
    [HttpPost]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(15 * 1024 * 1024)]
    [ProducesResponseType(typeof(ExpenseSubmissionResponse), 202)]
    public async Task<ActionResult<ExpenseSubmissionResponse>> Submit(
        IFormFile receipt,
        [FromForm] string?  category,
        [FromForm] string?  paymentMode,
        [FromForm] string?  purpose,
        [FromForm] string?  city,
        [FromForm] decimal? claimedAmount,
        [FromForm] string?  claimedDate,
        [FromForm] string?  claimedMerchant,
        [FromForm] string?  claimedGstin,
        [FromForm] string?  employeeName,
        [FromForm] string?  department,
        CancellationToken ct)
    {
        if (receipt is null || receipt.Length == 0) return BadRequest("receipt file is required");
        var userId = RequireUserId();

        await using var s = receipt.OpenReadStream();
        var upload = new ReceiptUpload(receipt.ContentType, receipt.Length, s, receipt.FileName);

        DateOnly? parsedDate = null;
        if (!string.IsNullOrWhiteSpace(claimedDate) && DateOnly.TryParse(claimedDate, out var d))
            parsedDate = d;

        var metadata = new SubmissionMetadata(
            Category:        NullIfBlank(category),
            PaymentMode:     NullIfBlank(paymentMode),
            Purpose:         NullIfBlank(purpose),
            City:            NullIfBlank(city),
            ClaimedAmount:   claimedAmount is > 0m ? claimedAmount : null,
            ClaimedDate:     parsedDate,
            ClaimedMerchant: NullIfBlank(claimedMerchant),
            ClaimedGstin:    NullIfBlank(claimedGstin)?.ToUpperInvariant(),
            EmployeeName:    NullIfBlank(employeeName),
            Department:      NullIfBlank(department));

        var result = await _submit.SubmitAsync(userId, upload, metadata, ct);
        return StatusCode(202, result);
    }

    // POST /api/expenses/ocr-preview — upload an image and get back OCR-extracted fields
    // (amount, vendor, date) WITHOUT creating an expense record. Used by mobile to
    // auto-fill the claim form before the user submits.
    [AllowAnonymous]
    [HttpPost("ocr-preview")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(15 * 1024 * 1024)]
    public async Task<IActionResult> OcrPreview(IFormFile receipt, CancellationToken ct)
    {
        if (receipt is null || receipt.Length == 0) return BadRequest("receipt file is required");

        var tmp = Path.Combine(Path.GetTempPath(), $"ocr_preview_{Guid.NewGuid()}{Path.GetExtension(receipt.FileName)}");
        try
        {
            await using (var fs = System.IO.File.Create(tmp))
                await receipt.CopyToAsync(fs, ct);

            var result = await _ocr.ExtractAsync(tmp, ct);

            return Ok(new
            {
                total    = result.Total,
                vendor   = result.Vendor,
                date     = result.Date?.ToString("yyyy-MM-dd"),
                currency = result.Currency,
                gstin    = result.Gstin,
                confidence = result.Score.Score
            });
        }
        finally
        {
            if (System.IO.File.Exists(tmp)) System.IO.File.Delete(tmp);
        }
    }

    // POST /api/expenses/ocr-preview-b64 — same as ocr-preview but accepts the image
    // as a base64 JSON body instead of multipart. Used by React Native clients where
    // multipart FormData can fail due to boundary handling issues in the HTTP stack.
    [AllowAnonymous]
    [HttpPost("ocr-preview-b64")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> OcrPreviewB64([FromBody] OcrPreviewB64Request req, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(req.ImageBase64)) return BadRequest("imageBase64 is required");

        byte[] imageBytes;
        try { imageBytes = Convert.FromBase64String(req.ImageBase64); }
        catch { return BadRequest("imageBase64 is not valid base64"); }

        var ext = (req.MimeType ?? "image/jpeg").ToLowerInvariant() switch
        {
            "image/png"  => ".png",
            "image/gif"  => ".gif",
            "image/webp" => ".webp",
            _            => ".jpg"
        };

        var tmp = Path.Combine(Path.GetTempPath(), $"ocr_b64_{Guid.NewGuid()}{ext}");
        try
        {
            await System.IO.File.WriteAllBytesAsync(tmp, imageBytes, ct);
            var result = await _ocr.ExtractAsync(tmp, ct);
            return Ok(new
            {
                total      = result.Total,
                vendor     = result.Vendor,
                date       = result.Date?.ToString("yyyy-MM-dd"),
                currency   = result.Currency,
                gstin      = result.Gstin,
                confidence = result.Score.Score
            });
        }
        finally
        {
            if (System.IO.File.Exists(tmp)) System.IO.File.Delete(tmp);
        }
    }

    private static string? NullIfBlank(string? s) =>
        string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    // POST /api/expenses/{id}/receipt — replace (or attach) a receipt on an existing expense.
    // Accepts same multipart payload as POST /api/expenses; for the hackathon demo we just
    // enqueue a fresh submission tied to the same expense by returning a new ref_id.
    [HttpPost("{id}/receipt")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(15 * 1024 * 1024)]
    public async Task<ActionResult<ExpenseSubmissionResponse>> AttachReceipt(
        Guid id, IFormFile receipt, CancellationToken ct)
    {
        if (receipt is null || receipt.Length == 0) return BadRequest("receipt file is required");
        var userId = RequireUserId();

        await using var s = receipt.OpenReadStream();
        var upload = new ReceiptUpload(receipt.ContentType, receipt.Length, s, receipt.FileName);
        var result = await _submit.SubmitAsync(userId, upload, metadata: null, ct);
        return StatusCode(202, result);
    }

    // GET /api/expenses/{id}        — id here is the ref_id (EXP-YYYY-MM-XXXX-XXXX); we do not
    //                                 expose internal UUIDs to clients.
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(ExpenseDecisionResponse), 200)]
    public async Task<ActionResult<ExpenseDecisionResponse>> Get(string id, CancellationToken ct)
    {
        var userId = RequireUserId();
        var res = await _query.GetByRefIdAsync(id, userId, ct);
        return res is null ? NotFound() : Ok(res);
    }

    // GET /api/expenses/{id}/decision — alias for Get but emphasizes "final decision" readiness.
    [HttpGet("{id}/decision")]
    [ProducesResponseType(typeof(ExpenseDecisionResponse), 200)]
    public Task<ActionResult<ExpenseDecisionResponse>> Decision(string id, CancellationToken ct) => Get(id, ct);

    // GET /api/expenses/recent — last 20 submissions for the authenticated user.
    [HttpGet("recent")]
    [ProducesResponseType(typeof(IReadOnlyList<ExpenseSummaryDto>), 200)]
    public async Task<ActionResult<IReadOnlyList<ExpenseSummaryDto>>> Recent(
        [FromQuery] int limit = 20, CancellationToken ct = default)
    {
        var userId = RequireUserId();
        var clamped = Math.Clamp(limit, 1, 100);
        return Ok(await _query.GetRecentAsync(userId, clamped, ct));
    }

    // GET /api/expenses/{id}/receipt — streams the original uploaded receipt image
    // for the authenticated owner. Inline disposition so <Image src> works on mobile.
    [HttpGet("{id}/receipt")]
    public async Task<IActionResult> GetReceipt(string id, CancellationToken ct)
    {
        var userId = RequireUserId();
        var exp = await _expenseRepo.GetByRefIdAsync(id, ct);
        if (exp is null || exp.UserId != userId) return NotFound();

        var r = await _expenseRepo.GetReceiptRefAsync(id, ct);
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

    private Guid RequireUserId()
    {
        var sub = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(sub, out var id))
            throw new UnauthorizedAccessException("invalid or missing sub claim");
        return id;
    }
}

public record OcrPreviewB64Request(string ImageBase64, string? MimeType);
