using System.Collections.Concurrent;

namespace Uc10.Infrastructure.Ai;

// Reads versioned prompt files from backend/prompts/. Caches in memory after
// first read so swapping a prompt requires a process restart — that's
// intentional: prompt version is part of the audit trail, and dynamic reloads
// would let two requests in the same process log different prompt versions
// under the same `UC10_AUDIT_PROMPT_V2` identifier.
//
// Prompts live next to the published DLL under ./prompts/ (see Uc10.Api.csproj
// and the Dockerfile). In dev, `dotnet run` puts them in bin/<Config>/net8.0/prompts/
// via CopyToOutputDirectory.
public class PromptLoader
{
    private readonly string _root;
    private readonly ConcurrentDictionary<string, string> _cache = new();

    public PromptLoader(string? overrideRoot = null)
    {
        _root = overrideRoot ?? ResolveRoot();
    }

    public string Load(string fileName)
    {
        return _cache.GetOrAdd(fileName, name =>
        {
            var path = Path.Combine(_root, name);
            if (!File.Exists(path))
                throw new FileNotFoundException($"prompt file not found: {path}", path);

            var text = File.ReadAllText(path);
            // Strip the YAML front-matter (starts with ---, ends with ---) so only
            // the prompt body goes to the model.
            return StripFrontMatter(text);
        });
    }

    private static string ResolveRoot()
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "prompts"),
            Path.Combine(Directory.GetCurrentDirectory(), "prompts"),
            // When running the project directly in dev the prompts still live two levels up.
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "prompts"),
        };
        foreach (var c in candidates)
        {
            var full = Path.GetFullPath(c);
            if (Directory.Exists(full)) return full;
        }
        // Last resort: use the first candidate so errors reference a sensible path.
        return candidates[0];
    }

    private static string StripFrontMatter(string raw)
    {
        if (!raw.StartsWith("---", StringComparison.Ordinal)) return raw;
        var end = raw.IndexOf("\n---", 3, StringComparison.Ordinal);
        if (end < 0) return raw;
        var after = end + 4;
        while (after < raw.Length && (raw[after] == '\n' || raw[after] == '\r')) after++;
        return raw[after..];
    }
}
