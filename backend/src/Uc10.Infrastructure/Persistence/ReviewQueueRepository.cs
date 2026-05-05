using Microsoft.EntityFrameworkCore;
using Uc10.Application.Abstractions;
using Uc10.Domain.Entities;
using Uc10.Domain.Enums;

namespace Uc10.Infrastructure.Persistence;

public class ReviewQueueRepository : IReviewQueueRepository
{
    private readonly Uc10DbContext _db;
    public ReviewQueueRepository(Uc10DbContext db) => _db = db;

    public async Task EnqueueAsync(Guid expenseId, string reason, CancellationToken ct)
    {
        var exists = await _db.ReviewQueue.AnyAsync(r => r.ExpenseId == expenseId, ct);
        if (exists) return;
        _db.ReviewQueue.Add(new ReviewQueueItem
        {
            Id = Guid.NewGuid(),
            ExpenseId = expenseId,
            Reason = reason,
            Status = ReviewStatus.Pending,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await _db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<ReviewQueueItem>> GetPagedAsync(ReviewStatus? status, int limit, int offset, CancellationToken ct)
    {
        var q = _db.ReviewQueue.AsNoTracking().Include(r => r.Expense).AsQueryable();
        if (status is ReviewStatus s) q = q.Where(r => r.Status == s);
        return await q.OrderByDescending(r => r.CreatedAt).Skip(offset).Take(limit).ToListAsync(ct);
    }

    public Task<ReviewQueueItem?> GetAsync(Guid id, CancellationToken ct) =>
        _db.ReviewQueue.AsNoTracking().Include(r => r.Expense).FirstOrDefaultAsync(r => r.Id == id, ct);

    public async Task DecideAsync(Guid id, ReviewStatus status, Guid decidedBy, string? note, CancellationToken ct)
    {
        var row = await _db.ReviewQueue.FirstOrDefaultAsync(r => r.Id == id, ct)
                  ?? throw new KeyNotFoundException($"review queue item {id} not found");
        row.Status = status;
        row.DecidedBy = decidedBy;
        row.DecidedAt = DateTimeOffset.UtcNow;
        row.DecisionNote = note;
        await _db.SaveChangesAsync(ct);

        // Also update the parent expense's status + completed_at.
        var expenseStatus = status == ReviewStatus.Approved ? ExpenseStatus.Approved : ExpenseStatus.Rejected;
        await _db.Database.ExecuteSqlRawAsync(
            "UPDATE expenses SET status = {0}::expense_status, needs_review = FALSE, completed_at = NOW() WHERE id = {1}",
            expenseStatus.ToString().ToLowerInvariant().Replace("needsreview","needs_review"), row.ExpenseId);
    }
}
