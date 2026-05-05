using System.Text;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using Uc10.Api.Middleware;
using Uc10.Application.Auth;
using Uc10.Application.Options;
using Uc10.Infrastructure;

// ---------- .env auto-loader ----------
// docker-compose loads .env automatically but `dotnet run` from VS or a plain
// terminal does not. This walks up from the running binary to find a .env at
// the repo root and hydrates process env vars — OpenAI__ApiKey, JWT secret,
// connection strings, etc. Non-blank existing env vars win over the file (so
// docker-compose-injected values aren't overridden), but blank/empty existing
// values are treated as "not set" — that's the gotcha that previously made
// the OpenAI service silently fall back to the stub when something upstream
// pre-set OpenAI__ApiKey="".
LoadDotEnvFile();

static void LoadDotEnvFile()
{
    var dir = new DirectoryInfo(AppContext.BaseDirectory);
    while (dir is not null && !File.Exists(Path.Combine(dir.FullName, ".env")))
        dir = dir.Parent;

    if (dir is null)
    {
        Console.WriteLine($"[UC10] .env not found by walking up from {AppContext.BaseDirectory}");
        return;
    }

    var path = Path.Combine(dir.FullName, ".env");
    Console.WriteLine($"[UC10] Loading .env from {path}");
    var loadedKeys = 0;
    foreach (var raw in File.ReadAllLines(path))
    {
        var line = raw.Trim();
        if (line.Length == 0 || line.StartsWith('#')) continue;
        var eq = line.IndexOf('=');
        if (eq < 1) continue;
        var key = line[..eq].Trim();
        var val = line[(eq + 1)..].Trim();
        // Strip a single pair of matching wrapping quotes.
        if (val.Length >= 2 &&
            ((val[0] == '"'  && val[^1] == '"') ||
             (val[0] == '\'' && val[^1] == '\'')))
        {
            val = val[1..^1];
        }
        // Set if the existing process env var is null OR empty/whitespace.
        // Empty existing values silently shadowed real values from .env in
        // earlier versions of this loader, which made debugging baffling
        // ("OCR returns DEMO VENDOR even though .env has my key!").
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key)))
        {
            Environment.SetEnvironmentVariable(key, val);
            loadedKeys++;
        }
    }
    Console.WriteLine($"[UC10] .env applied {loadedKeys} key(s) into process environment.");
}

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);
    builder.Host.UseSerilog((ctx, cfg) => cfg
        .ReadFrom.Configuration(ctx.Configuration)
        .Enrich.FromLogContext()
        .WriteTo.Console());

    var services = builder.Services;
    var config = builder.Configuration;

    services.AddUc10Infrastructure(config);

    services.AddValidatorsFromAssemblyContaining<RegisterRequestValidator>();
    services.AddFluentValidationAutoValidation();

    services.AddControllers();
    services.AddEndpointsApiExplorer();

    var corsOrigins = (config["Cors:AllowedOrigins"] ?? "http://localhost:4200")
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    services.AddCors(o => o.AddDefaultPolicy(p => p
        .WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod()));

    var jwt = config.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
              ?? throw new InvalidOperationException("Jwt config missing");
    var keyBytes = Encoding.UTF8.GetBytes(jwt.Secret);
    services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(o =>
        {
            o.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = jwt.Issuer,
                ValidAudience = jwt.Audience,
                IssuerSigningKey = new SymmetricSecurityKey(keyBytes),
                ClockSkew = TimeSpan.FromSeconds(30)
            };
        });
    services.AddAuthorization();

    services.AddSwaggerGen(o =>
    {
        o.SwaggerDoc("v1", new OpenApiInfo { Title = "UC10 API", Version = "v1" });
        o.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description = "JWT issued by /api/auth/login"
        });
        o.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            { new OpenApiSecurityScheme {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
              Array.Empty<string>() }
        });
    });

    services.AddHealthChecks()
        .AddNpgSql(config.GetConnectionString("Default")!);

    var app = builder.Build();

    app.UseSerilogRequestLogging();
    app.UseMiddleware<GlobalExceptionMiddleware>();
    app.UseCors();
    app.UseAuthentication();
    app.UseAuthorization();
    app.MapControllers();
    app.MapHealthChecks("/health");

    app.UseSwagger();
    app.UseSwaggerUI(o => { o.RoutePrefix = "swagger"; o.DocumentTitle = "UC10 API"; });

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "UC10 API terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}

public partial class Program { }
