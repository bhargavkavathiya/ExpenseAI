using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Uc10.Application.Abstractions;
using Uc10.Application.Options;
using Uc10.Domain.Abstractions;
using Uc10.Domain.Enums;

namespace Uc10.Application.Expenses;

public class ExpenseSubmissionException : Exception
{
    public ExpenseSubmissionException(string message) : base(message) { }
}

public class ExpenseSubmissionService
{
    private readonly IReceiptStorage _storage;
    private readonly IExpenseRepository _expenses;
    private readonly IReferenceIdGenerator _refIds;
    private readonly IClock _clock;
    private readonly StorageOptions _storageOpts;
    private readonly IAiPipelineDispatcher _dispatcher;
    private readonly ILogger<ExpenseSubmissionService> _log;

    public ExpenseSubmissionService(
        IReceiptStorage storage, IExpenseRepository expenses, IReferenceIdGenerator refIds, IClock clock,
        IOptions<StorageOptions> storageOpts, IAiPipelineDispatcher dispatcher,
        ILogger<ExpenseSubmissionService> log)
    {
        _storage = storage;
        _expenses = expenses;
        _refIds = refIds;
        _clock = clock;
        _storageOpts = storageOpts.Value;
        _dispatcher = dispatcher;
        _log = log;
    }

    public async Task<ExpenseSubmissionResponse> SubmitAsync(
        Guid userId, ReceiptUpload upload, SubmissionMetadata? metadata, CancellationToken ct)
    {
        ValidateUpload(upload);

        var refId = _refIds.Generate();
        var stored = await _storage.SaveAsync(refId, upload, ct);
        var submittedAt = _clock.UtcNow;

        var expenseId = await _expenses.CreateSubmissionAsync(
            userId, refId, stored.ContentType, stored.SizeBytes, stored.StoragePath,
            phash: null, metadata: metadata, ct);

        _log.LogInformation("Expense submitted ref={RefId} id={Id} userId={UserId} category={Cat}",
            refId, expenseId, userId, metadata?.Category ?? "-");
        await _dispatcher.EnqueueAsync(expenseId, refId, userId, stored.StoragePath);

        return new ExpenseSubmissionResponse(refId, "processing", submittedAt);
    }

    private void ValidateUpload(ReceiptUpload upload)
    {
        if (!_storageOpts.AllowedContentTypes.Contains(upload.ContentType, StringComparer.OrdinalIgnoreCase))
            throw new ExpenseSubmissionException(
                $"unsupported content type '{upload.ContentType}'. Allowed: {string.Join(", ", _storageOpts.AllowedContentTypes)}");
        if (upload.SizeBytes <= 0)
            throw new ExpenseSubmissionException("empty upload");
        if (upload.SizeBytes > _storageOpts.MaxBytes)
            throw new ExpenseSubmissionException(
                $"file too large ({upload.SizeBytes} bytes, max {_storageOpts.MaxBytes})");
    }
}

// Dispatcher interface is in Application; the IHostedService + channel implementation lives in Infrastructure.
public interface IAiPipelineDispatcher
{
    Task EnqueueAsync(Guid expenseId, string refId, Guid userId, string storagePath);
}
