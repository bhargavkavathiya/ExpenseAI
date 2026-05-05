using System.Threading.Channels;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Uc10.Application.Expenses;

namespace Uc10.Infrastructure.Ai;

public record PipelineJob(Guid ExpenseId, string RefId, Guid UserId, string StoragePath);

// Single-process in-memory dispatcher. Good enough for a hackathon demo; for
// production, replace with a real queue (Rabbit, SQS, etc.).
public class ChannelAiPipelineDispatcher : IAiPipelineDispatcher
{
    private readonly Channel<PipelineJob> _channel;

    public ChannelAiPipelineDispatcher()
    {
        _channel = Channel.CreateUnbounded<PipelineJob>(new UnboundedChannelOptions
        {
            SingleReader = true, SingleWriter = false
        });
    }

    internal ChannelReader<PipelineJob> Reader => _channel.Reader;

    public Task EnqueueAsync(Guid expenseId, string refId, Guid userId, string storagePath) =>
        _channel.Writer.WriteAsync(new PipelineJob(expenseId, refId, userId, storagePath)).AsTask();
}

public class AiPipelineHostedService : BackgroundService
{
    private readonly ChannelAiPipelineDispatcher _dispatcher;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<AiPipelineHostedService> _log;

    public AiPipelineHostedService(
        ChannelAiPipelineDispatcher dispatcher,
        IServiceScopeFactory scopes,
        ILogger<AiPipelineHostedService> log)
    {
        _dispatcher = dispatcher;
        _scopes = scopes;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("AI pipeline worker started.");
        await foreach (var job in _dispatcher.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var orchestrator = scope.ServiceProvider.GetRequiredService<ExpenseDecisionOrchestrator>();
                await orchestrator.RunAsync(job.ExpenseId, job.RefId, job.UserId, job.StoragePath, stoppingToken);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "pipeline job failed for ref={RefId}", job.RefId);
            }
        }
    }
}
