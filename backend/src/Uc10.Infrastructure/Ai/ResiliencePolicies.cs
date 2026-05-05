using Microsoft.Extensions.Logging;
using Polly;
using Polly.CircuitBreaker;
using Polly.Extensions.Http;
using Polly.Timeout;

namespace Uc10.Infrastructure.Ai;

// Centralised Polly policies for external HTTP calls.
//   Retry:   3 attempts with exponential backoff + jitter (100ms × 2^n), on 5xx / 408 / network errors.
//   Timeout: per-attempt timeout from options (default 5s OpenAI, 3s GSTIN).
//   Circuit: opens after 5 consecutive failures; half-open probe after 30s.
//
// Matches FRS §3.5: "retry with exponential backoff (maximum three attempts) and
// a circuit breaker (open after five consecutive failures, half-open after 30 seconds)".
public static class ResiliencePolicies
{
    public static IAsyncPolicy<HttpResponseMessage> Retry(string name, ILoggerFactory? lf = null)
    {
        var log = lf?.CreateLogger($"Polly.Retry.{name}");
        var jitterer = new Random();
        return HttpPolicyExtensions
            .HandleTransientHttpError()                         // 5xx, 408
            .Or<TimeoutRejectedException>()
            .WaitAndRetryAsync(
                retryCount: 3,
                sleepDurationProvider: attempt =>
                    TimeSpan.FromMilliseconds(100 * Math.Pow(2, attempt - 1))
                    + TimeSpan.FromMilliseconds(jitterer.Next(0, 75)),
                onRetry: (outcome, delay, attempt, _) =>
                    log?.LogWarning("{Name} retry {Attempt} in {Delay}ms after {Status}",
                        name, attempt, delay.TotalMilliseconds,
                        outcome.Result?.StatusCode.ToString() ?? outcome.Exception?.GetType().Name));
    }

    public static IAsyncPolicy<HttpResponseMessage> Timeout(TimeSpan total, string name, ILoggerFactory? lf = null)
    {
        // Policy.TimeoutAsync surfaces a TimeoutRejectedException on expiry; the retry policy above catches it.
        return Policy.TimeoutAsync<HttpResponseMessage>(total, TimeoutStrategy.Optimistic);
    }

    public static IAsyncPolicy<HttpResponseMessage> CircuitBreaker(string name, ILoggerFactory? lf = null)
    {
        var log = lf?.CreateLogger($"Polly.CircuitBreaker.{name}");
        return HttpPolicyExtensions
            .HandleTransientHttpError()
            .Or<TimeoutRejectedException>()
            .CircuitBreakerAsync(
                handledEventsAllowedBeforeBreaking: 5,
                durationOfBreak: TimeSpan.FromSeconds(30),
                onBreak: (outcome, ts) =>
                    log?.LogError("{Name} circuit OPEN for {Duration}s after {Status}",
                        name, ts.TotalSeconds,
                        outcome.Result?.StatusCode.ToString() ?? outcome.Exception?.GetType().Name ?? "error"),
                onReset: () => log?.LogInformation("{Name} circuit CLOSED — recovered.", name),
                onHalfOpen: () => log?.LogInformation("{Name} circuit HALF-OPEN — probing.", name));
    }
}
