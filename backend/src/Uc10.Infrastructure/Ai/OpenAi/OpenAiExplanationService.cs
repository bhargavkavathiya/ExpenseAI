using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Uc10.Infrastructure.Ai.OpenAi;

// Generates the three-sentence plain-language explanation (FR-3.11) via GPT-4o.
// Standalone service rather than a pipeline module; the orchestrator can
// optionally call this after aggregation and attach the text to the result.
// Not on any critical path — if this fails we just log and skip.
public class OpenAiExplanationService
{
    private const string PromptFile = "explanation_v1.0.0.md";
    public const string PromptVersion = "explanation_v1.0.0";

    private readonly OpenAiClient _client;
    private readonly PromptLoader _prompts;
    private readonly ILogger<OpenAiExplanationService> _log;

    public OpenAiExplanationService(OpenAiClient client, PromptLoader prompts, ILogger<OpenAiExplanationService> log)
    {
        _client = client;
        _prompts = prompts;
        _log = log;
    }

    public async Task<string?> ExplainAsync(object decisionSnapshot, CancellationToken ct)
    {
        string systemPrompt;
        try { systemPrompt = _prompts.Load(PromptFile); }
        catch (FileNotFoundException ex)
        {
            _log.LogWarning(ex, "Explanation prompt missing; skipping.");
            return null;
        }

        var userJson = JsonSerializer.Serialize(decisionSnapshot);
        try
        {
            var text = await _client.CompleteTextAsync(systemPrompt,
                $"Produce the explanation for this decision:\n{userJson}", ct);
            return text.Trim();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Explanation generation failed; skipping.");
            return null;
        }
    }
}
