using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Uc10.Application.Abstractions;
using Uc10.Application.Options;

namespace Uc10.Infrastructure.Ai.OpenAi;

// Thin typed HttpClient over OpenAI's chat.completions API.
//   - No dependency on the official OpenAI SDK — keeps the wire format explicit and
//     makes mocking in tests easier.
//   - Polly policies (retry + timeout + circuit breaker) are registered on the named
//     HttpClient in DependencyInjection.cs; this class is unaware of resilience so
//     it stays a pure transport layer.
//   - `response_format: json_object` is set for endpoints that require strict JSON
//     (OCR, fuzzy policy). Plain text callers pass null.
public class OpenAiClient
{
    public const string HttpClientName = "openai";

    private readonly HttpClient _http;
    private readonly OpenAIOptions _opts;
    private readonly IIntegrationStatusRepository _status;
    private readonly ILogger<OpenAiClient> _log;

    public OpenAiClient(HttpClient http, IOptions<OpenAIOptions> opts,
        IIntegrationStatusRepository status, ILogger<OpenAiClient> log)
    {
        _http = http;
        _opts = opts.Value;
        _status = status;
        _log = log;
        _http.BaseAddress = new Uri("https://api.openai.com/");
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (!string.IsNullOrWhiteSpace(_opts.ApiKey))
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _opts.ApiKey);
    }

    public async Task<string> CompleteJsonAsync(
        string systemPrompt, string userText, string? imageBase64 = null, CancellationToken ct = default)
    {
        var messages = BuildMessages(systemPrompt, userText, imageBase64);
        var body = new
        {
            model = _opts.Model,
            temperature = 0.0,
            response_format = new { type = "json_object" },
            messages
        };
        return await SendAsync(body, ct);
    }

    public async Task<string> CompleteTextAsync(
        string systemPrompt, string userText, CancellationToken ct = default)
    {
        var body = new
        {
            model = _opts.Model,
            temperature = 0.2,
            messages = BuildMessages(systemPrompt, userText, null)
        };
        return await SendAsync(body, ct);
    }

    private async Task<string> SendAsync(object requestBody, CancellationToken ct)
    {
        try
        {
            using var resp = await _http.PostAsJsonAsync("v1/chat/completions", requestBody, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync(ct);
                await _status.RecordFailureAsync("openai", $"HTTP {(int)resp.StatusCode}: {Trim(err, 240)}", ct);
                _log.LogWarning("OpenAI non-2xx {Status}: {Body}", resp.StatusCode, Trim(err, 400));
                throw new HttpRequestException($"openai http {(int)resp.StatusCode}: {Trim(err, 240)}",
                    inner: null, statusCode: resp.StatusCode);
            }

            using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            var content = doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString()
                ?? throw new InvalidOperationException("openai response missing choices[0].message.content");

            await _status.RecordSuccessAsync("openai", ct);
            return content;
        }
        catch (Exception ex) when (ex is not HttpRequestException)
        {
            await _status.RecordFailureAsync("openai", Trim(ex.Message, 240), ct);
            throw;
        }
    }

    private static object[] BuildMessages(string system, string userText, string? imgB64)
    {
        if (imgB64 is null)
        {
            return new object[]
            {
                new { role = "system", content = system },
                new { role = "user",   content = userText }
            };
        }
        return new object[]
        {
            new { role = "system", content = system },
            new { role = "user", content = new object[]
            {
                new { type = "text", text = userText },
                new { type = "image_url", image_url = new { url = $"data:image/jpeg;base64,{imgB64}" } }
            } }
        };
    }

    private static string Trim(string s, int max) =>
        string.IsNullOrEmpty(s) ? "" : s.Length <= max ? s : s[..max] + "…";
}
