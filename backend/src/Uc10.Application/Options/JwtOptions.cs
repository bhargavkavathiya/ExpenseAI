namespace Uc10.Application.Options;

public class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Secret { get; set; } = default!;
    public string Issuer { get; set; } = "uc10-api";
    public string Audience { get; set; } = "uc10-clients";
    public int AccessTokenTtlMinutes { get; set; } = 720;
}

public class StorageOptions
{
    public const string SectionName = "Storage";
    public string UploadsPath { get; set; } = "/app/uploads";
    public long MaxBytes { get; set; } = 10L * 1024 * 1024;
    public string[] AllowedContentTypes { get; set; } =
        new[] { "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf" };
}

public class OpenAIOptions
{
    public const string SectionName = "OpenAI";
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "gpt-4o";
    public int TimeoutMs { get; set; } = 5000;
}

public class GstinOptions
{
    public const string SectionName = "Gstin";
    public string ApiKey { get; set; } = "";
    public string ApiBase { get; set; } = "https://api.example-gst.in";
    public int TimeoutMs { get; set; } = 3000;
}

public class CorsOptions
{
    public const string SectionName = "Cors";
    public string AllowedOrigins { get; set; } = "http://localhost:4200";
    public string[] ParseOrigins() =>
        AllowedOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
