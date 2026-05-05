using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using Npgsql.NameTranslation;
using Uc10.Application.Abstractions;
using Uc10.Application.Auth;
using Uc10.Application.Expenses;
using Uc10.Application.Options;
using Uc10.Domain.Abstractions;
using Uc10.Domain.Enums;
using Uc10.Infrastructure.Ai;
using Uc10.Infrastructure.Ai.Gstin;
using Uc10.Infrastructure.Ai.OpenAi;
using Uc10.Infrastructure.Ai.PerceptualHash;
using Uc10.Infrastructure.Persistence;
using Uc10.Infrastructure.Security;
using Uc10.Infrastructure.Storage;

namespace Uc10.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddUc10Infrastructure(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<JwtOptions>(config.GetSection(JwtOptions.SectionName));
        services.Configure<StorageOptions>(config.GetSection(StorageOptions.SectionName));
        services.Configure<OpenAIOptions>(config.GetSection(OpenAIOptions.SectionName));
        services.Configure<GstinOptions>(config.GetSection(GstinOptions.SectionName));
        services.Configure<CorsOptions>(config.GetSection(CorsOptions.SectionName));

        var cs = config.GetConnectionString("Default")
                 ?? throw new InvalidOperationException("ConnectionStrings:Default is required");

        // Register our five custom Postgres enum types with Npgsql so EF doesn't
        // send plain text (the column type mismatch blew up integration_status
        // updates). Snake-case translator maps C# NeedsReview -> needs_review.
        var dataSourceBuilder = new NpgsqlDataSourceBuilder(cs);
        var snake = new NpgsqlSnakeCaseNameTranslator();
        dataSourceBuilder.MapEnum<ExpenseStatus>("expense_status", snake);
        dataSourceBuilder.MapEnum<PolicyRuleType>("policy_rule_type", snake);
        dataSourceBuilder.MapEnum<ReviewStatus>("review_status", snake);
        dataSourceBuilder.MapEnum<IntegrationHealth>("integration_health", snake);
        dataSourceBuilder.MapEnum<CircuitState>("circuit_state", snake);
        var dataSource = dataSourceBuilder.Build();
        services.AddSingleton(dataSource);

        services.AddDbContext<Uc10DbContext>(o =>
            o.UseNpgsql(dataSource, npg => npg.EnableRetryOnFailure(3)));

        // Core
        services.AddSingleton<IClock, SystemClock>();
        services.AddSingleton<IReferenceIdGenerator, ReferenceIdGenerator>();
        services.AddSingleton<IPasswordHasher, BcryptPasswordHasher>();
        services.AddSingleton<ITokenIssuer, JwtTokenIssuer>();
        services.AddSingleton<PromptLoader>();

        // Persistence / storage
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IEmployeeBandRepository, EmployeeBandRepository>();
        services.AddScoped<IExpenseRepository, ExpenseRepository>();
        services.AddScoped<IAuditLogService, AuditLogService>();
        services.AddScoped<IThresholdRepository, ThresholdRepository>();
        services.AddScoped<IReviewQueueRepository, ReviewQueueRepository>();
        services.AddScoped<IDuplicateHashRepository, DuplicateHashRepository>();
        services.AddScoped<IPolicyRuleRepository, PolicyRuleRepository>();
        services.AddScoped<IIntegrationStatusRepository, IntegrationStatusRepository>();
        services.AddSingleton<IReceiptStorage, LocalFileReceiptStorage>();

        // --- pHash (real, regardless of key presence) ---
        services.AddScoped<IPerceptualHasher, ImageSharpPerceptualHasher>();

        // --- AI module swaps ---
        RegisterOpenAi(services, config);
        RegisterGstin(services, config);

        services.AddScoped<IAnomalyDetectionService, Ai.StubAnomalyDetectionService>();
        services.AddScoped<IPolicyRuleEngine, Ai.StubPolicyRuleEngine>();
        services.AddScoped<IDuplicateDetectionService, Ai.StubDuplicateDetectionService>();
        services.AddScoped<IConfidenceAggregator, WeightedAverageConfidenceAggregator>();

        // Background pipeline
        services.AddSingleton<Ai.ChannelAiPipelineDispatcher>();
        services.AddSingleton<IAiPipelineDispatcher>(sp => sp.GetRequiredService<Ai.ChannelAiPipelineDispatcher>());
        services.AddHostedService<Ai.AiPipelineHostedService>();

        // Demo-user seeder. Re-applies admin/compliance/analyst/customer @demo.local
        // every startup; idempotent so it's safe to leave on permanently.
        services.AddHostedService<DemoUserSeeder>();

        // Dashboard reader
        services.AddScoped<IDashboardReader, DashboardReader>();

        // Application services
        services.AddScoped<AuthService>();
        services.AddScoped<ExpenseSubmissionService>();
        services.AddScoped<ExpenseDecisionOrchestrator>();
        services.AddScoped<ExpenseQueryService>();
        services.AddScoped<Application.Admin.AdminDashboardService>();
        services.AddScoped<Application.Admin.ReviewQueueService>();
        services.AddScoped<Application.Admin.ThresholdService>();
        services.AddScoped<Application.Admin.PolicyRulesService>();
        services.AddScoped<Application.Admin.EmployeeBandsService>();
        services.AddScoped<Application.Admin.AuditQueryService>();
        services.AddScoped<Application.Admin.IntegrationsService>();

        return services;
    }

    // --- OpenAI ---
    // When OpenAI:ApiKey is blank -> stubs. When present -> real HttpClient + Polly
    // pipeline (retry + timeout + circuit breaker) around OpenAiClient, and the
    // OCR service swaps to the live GPT-4o implementation.
    private static void RegisterOpenAi(IServiceCollection services, IConfiguration config)
    {
        var opts = config.GetSection(OpenAIOptions.SectionName).Get<OpenAIOptions>() ?? new();
        var hasKey = !string.IsNullOrWhiteSpace(opts.ApiKey);

        // Loud startup banner so it's obvious in console which service is wired.
        // The user-reported "DEMO VENDOR (stub)" / ₹1234 results always come from
        // StubOcrExtractionService — if you see this banner say "stub", the env
        // var didn't reach the process. Check .env loading + appsettings.json.
        Console.WriteLine($"[UC10] OCR service: {(hasKey ? $"OpenAI GPT-4o (key prefix={opts.ApiKey[..Math.Min(8, opts.ApiKey.Length)]}…)" : "STUB — set OpenAI__ApiKey in .env to enable real vision OCR")}");

        if (!hasKey)
        {
            services.AddScoped<IOcrExtractionService, Ai.StubOcrExtractionService>();
            return;
        }

        services.AddHttpClient<OpenAiClient>(c =>
        {
            c.Timeout = TimeSpan.FromMilliseconds(Math.Max(opts.TimeoutMs, 2_000) * 4); // outer cap; Polly timeout is per-attempt
        })
        .AddPolicyHandler((sp, _) => ResiliencePolicies.Timeout(
            TimeSpan.FromMilliseconds(Math.Max(opts.TimeoutMs, 1_000)),
            "openai",
            sp.GetService<ILoggerFactory>()))
        .AddPolicyHandler((sp, _) => ResiliencePolicies.Retry("openai",
            sp.GetService<ILoggerFactory>()))
        .AddPolicyHandler((sp, _) => ResiliencePolicies.CircuitBreaker("openai",
            sp.GetService<ILoggerFactory>()));

        services.AddScoped<IOcrExtractionService, OpenAiOcrService>();
        services.AddScoped<OpenAiExplanationService>();
    }

    // --- GSTIN ---
    // Always registers the real HttpGstinLookupService — the service itself
    // returns an "lookup_disabled" result when the API key is missing, so the
    // pipeline keeps flowing.
    private static void RegisterGstin(IServiceCollection services, IConfiguration config)
    {
        var opts = config.GetSection(GstinOptions.SectionName).Get<GstinOptions>() ?? new();

        services.AddHttpClient<HttpGstinLookupService>(c =>
        {
            c.Timeout = TimeSpan.FromMilliseconds(Math.Max(opts.TimeoutMs, 2_000) * 3);
        })
        .AddPolicyHandler((sp, _) => ResiliencePolicies.Timeout(
            TimeSpan.FromMilliseconds(Math.Max(opts.TimeoutMs, 1_000)),
            "gstin", sp.GetService<ILoggerFactory>()))
        .AddPolicyHandler((sp, _) => ResiliencePolicies.Retry("gstin",
            sp.GetService<ILoggerFactory>()))
        .AddPolicyHandler((sp, _) => ResiliencePolicies.CircuitBreaker("gstin",
            sp.GetService<ILoggerFactory>()));

        services.AddScoped<IGstinLookupService>(sp =>
            sp.GetRequiredService<HttpGstinLookupService>());
    }
}
