using System.Text.Json;
using Microsoft.Extensions.Logging;
using Uc10.Application.Abstractions;
using Uc10.Domain.Enums;

namespace Uc10.Infrastructure.Ai.OpenAi;

// Live OCR using GPT-4o Vision. Follows the ocr_v1.0.0 prompt verbatim so the
// model version + prompt version pair persisted in audit_logs is reproducible.
// On failure the caller (orchestrator) can still complete the pipeline — we
// surface a low-confidence result rather than throwing, so the audit log still
// gets a row per module and the case routes to human review.
public class OpenAiOcrService : IOcrExtractionService
{
    private const string PromptFile = "ocr_v1.0.0.md";
    private const string PromptVersion = "ocr_v1.0.0";

    private readonly OpenAiClient _client;
    private readonly PromptLoader _prompts;
    private readonly ILogger<OpenAiOcrService> _log;

    public OpenAiOcrService(OpenAiClient client, PromptLoader prompts, ILogger<OpenAiOcrService> log)
    {
        _client = client;
        _prompts = prompts;
        _log = log;
    }

    public async Task<OcrExtraction> ExtractAsync(string storagePath, CancellationToken ct)
    {
        // PDFs aren't accepted by the GPT-4o `image_url` content part — Vision
        // wants raster bitmaps. Rather than fail the whole pipeline, we skip
        // OCR for PDFs and return a low-confidence "skipped" result. The
        // aggregator will route the claim to human review (queue), where the
        // reviewer drawer renders the PDF inline via the receipt endpoint.
        if (string.Equals(Path.GetExtension(storagePath), ".pdf", StringComparison.OrdinalIgnoreCase))
        {
            return new OcrExtraction(
                Vendor: null, Gstin: null, Date: null, Total: null, Currency: "INR",
                Items: Array.Empty<ReceiptLineItem>(),
                Score: new ModuleScore(
                    Module: AiModuleNames.Ocr,
                    ModelVersion: "gpt-4o",
                    PromptVersion: PromptVersion,
                    Score: 0.30m,                  // low — forces review
                    Summary: "OCR skipped — PDF receipt requires manual verification.",
                    Details: new Dictionary<string, object?>
                    {
                        ["source"] = "openai",
                        ["skipped"] = true,
                        ["skip_reason"] = "pdf_not_supported_by_vision",
                        ["storage_path"] = storagePath
                    }));
        }

        byte[] bytes;
        try
        {
            bytes = await File.ReadAllBytesAsync(storagePath, ct);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "OCR could not read file {Path}", storagePath);
            return FailureScore($"could not read uploaded file: {ex.Message}");
        }

        var b64 = Convert.ToBase64String(bytes);
        string systemPrompt;
        try { systemPrompt = _prompts.Load(PromptFile); }
        catch (FileNotFoundException ex)
        {
            _log.LogError(ex, "OCR prompt file missing");
            return FailureScore("OCR prompt file missing on server");
        }

        string json;
        try
        {
            json = await _client.CompleteJsonAsync(systemPrompt,
                "Extract all fields from this receipt image per the schema.", b64, ct);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "OpenAI OCR call failed");
            return FailureScore($"openai call failed: {ex.GetType().Name}");
        }

        return ParseExtraction(json, storagePath);
    }

    private static OcrExtraction ParseExtraction(string json, string storagePath)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var r = doc.RootElement;

            string? vendor  = ReadString(r, "vendor");
            string? gstin   = ReadString(r, "gstin");
            DateOnly? date  = DateOnly.TryParse(ReadString(r, "date") ?? "", out var d) ? d : null;
            decimal? total  = ReadDecimal(r, "total");
            var currency    = ReadString(r, "currency") ?? "INR";

            var items = new List<ReceiptLineItem>();
            if (r.TryGetProperty("items", out var itemsEl) && itemsEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var it in itemsEl.EnumerateArray())
                {
                    items.Add(new ReceiptLineItem(
                        Description: ReadString(it, "description") ?? "(no description)",
                        Quantity:    ReadDecimal(it, "quantity") ?? 1m,
                        UnitPrice:   ReadDecimal(it, "unit_price"),
                        Total:       ReadDecimal(it, "total")));
                }
            }

            var perField = r.TryGetProperty("per_field_confidence", out var pfc) && pfc.ValueKind == JsonValueKind.Object
                ? pfc : default;
            var confidence = ComputeOverallConfidence(perField, vendor, gstin, date, total);

            var details = new Dictionary<string, object?>
            {
                ["source"] = "openai",
                ["storage_path"] = storagePath,
                ["per_field_confidence"] = perField.ValueKind == JsonValueKind.Object ? (object)perField.Clone() : null
            };

            return new OcrExtraction(
                Vendor: vendor,
                Gstin: NormalizeGstin(gstin),
                Date: date,
                Total: total,
                Currency: currency,
                Items: items,
                Score: new ModuleScore(
                    Module: AiModuleNames.Ocr,
                    ModelVersion: "gpt-4o",
                    PromptVersion: PromptVersion,
                    Score: confidence,
                    Summary: $"Extracted {NonNull(vendor, gstin, date, total)} fields from receipt.",
                    Details: details));
        }
        catch (Exception ex)
        {
            return FailureScore($"failed to parse model JSON: {ex.Message}");
        }
    }

    private static decimal ComputeOverallConfidence(JsonElement perField, string? vendor, string? gstin, DateOnly? date, decimal? total)
    {
        // Average per-field confidences for fields we actually got back.
        if (perField.ValueKind != JsonValueKind.Object)
        {
            // Fallback: count populated fields / 4.
            var filled = (vendor != null ? 1 : 0) + (gstin != null ? 1 : 0) + (date != null ? 1 : 0) + (total != null ? 1 : 0);
            return Math.Round(0.4m + filled * 0.15m, 4);
        }
        decimal sum = 0; int n = 0;
        foreach (var kv in perField.EnumerateObject())
        {
            if (kv.Value.ValueKind == JsonValueKind.Number)
            {
                sum += kv.Value.GetDecimal();
                n++;
            }
        }
        if (n == 0) return 0.5m;
        var avg = sum / n;
        return Math.Round(Math.Clamp(avg, 0m, 1m), 4);
    }

    private static string? ReadString(JsonElement e, string key) =>
        e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static decimal? ReadDecimal(JsonElement e, string key)
    {
        if (!e.TryGetProperty(key, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.Number => v.GetDecimal(),
            JsonValueKind.String => decimal.TryParse(v.GetString(), out var d) ? d : (decimal?)null,
            _ => null
        };
    }

    private static string? NormalizeGstin(string? gstin)
    {
        if (string.IsNullOrWhiteSpace(gstin)) return null;
        var g = gstin.Trim().ToUpperInvariant().Replace(" ", "");
        // FRS: GSTIN is exactly 15 chars.
        return g.Length == 15 ? g : null;
    }

    private static int NonNull(params object?[] vals)
    {
        var n = 0;
        foreach (var v in vals) if (v is not null) n++;
        return n;
    }

    private static OcrExtraction FailureScore(string reason) =>
        new(
            Vendor: null, Gstin: null, Date: null, Total: null, Currency: "INR",
            Items: Array.Empty<ReceiptLineItem>(),
            Score: new ModuleScore(
                Module: AiModuleNames.Ocr,
                ModelVersion: "gpt-4o",
                PromptVersion: PromptVersion,
                Score: 0.10m,
                Summary: $"OCR failed: {reason}. Claim routed to human review.",
                Details: new Dictionary<string, object?>
                {
                    ["source"] = "openai",
                    ["error"] = reason
                }));
}
