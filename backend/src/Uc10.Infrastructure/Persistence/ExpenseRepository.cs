using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Uc10.Application.Abstractions;
using Uc10.Domain.Entities;
using Uc10.Domain.Enums;

namespace Uc10.Infrastructure.Persistence;

public class ExpenseRepository : IExpenseRepository
{
    private readonly Uc10DbContext _db;

    public ExpenseRepository(Uc10DbContext db) => _db = db;

    public async Task<Guid> CreateSubmissionAsync(
        Guid userId, string refId, string contentType, long sizeBytes, string storagePath,
        string? phash, SubmissionMetadata? metadata, CancellationToken ct)
    {
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(ct);

        await using var cmd = (NpgsqlCommand)conn.CreateCommand();
        cmd.CommandText = "SELECT sp_create_expense_submission(@user, @ref, @ct, @size, @path, @phash)";
        cmd.Parameters.Add(new NpgsqlParameter("user",  NpgsqlDbType.Uuid)   { Value = userId });
        cmd.Parameters.Add(new NpgsqlParameter("ref",   NpgsqlDbType.Text)   { Value = refId });
        cmd.Parameters.Add(new NpgsqlParameter("ct",    NpgsqlDbType.Text)   { Value = contentType });
        cmd.Parameters.Add(new NpgsqlParameter("size",  NpgsqlDbType.Bigint) { Value = sizeBytes });
        cmd.Parameters.Add(new NpgsqlParameter("path",  NpgsqlDbType.Text)   { Value = storagePath });
        cmd.Parameters.Add(new NpgsqlParameter("phash", NpgsqlDbType.Char)   { Value = (object?)phash ?? DBNull.Value });

        var expenseId = (Guid)(await cmd.ExecuteScalarAsync(ct))!;

        if (metadata is not null && HasAny(metadata))
        {
            await using var upd = (NpgsqlCommand)conn.CreateCommand();
            upd.CommandText = @"UPDATE expenses
                                   SET category         = COALESCE(@cat,  category),
                                       payment_mode     = COALESCE(@pay,  payment_mode),
                                       purpose          = COALESCE(@purp, purpose),
                                       city             = COALESCE(@city, city),
                                       claimed_amount   = COALESCE(@camt, claimed_amount),
                                       claimed_date     = COALESCE(@cdte, claimed_date),
                                       claimed_merchant = COALESCE(@cmer, claimed_merchant),
                                       claimed_gstin    = COALESCE(@cgst, claimed_gstin),
                                       employee_name    = COALESCE(@ename, employee_name),
                                       department       = COALESCE(@dept, department)
                                 WHERE id = @id";
            upd.Parameters.Add(new NpgsqlParameter("cat",   NpgsqlDbType.Text)    { Value = (object?)metadata.Category        ?? DBNull.Value });
            upd.Parameters.Add(new NpgsqlParameter("pay",   NpgsqlDbType.Text)    { Value = (object?)metadata.PaymentMode     ?? DBNull.Value });
            upd.Parameters.Add(new NpgsqlParameter("purp",  NpgsqlDbType.Text)    { Value = (object?)metadata.Purpose         ?? DBNull.Value });
            upd.Parameters.Add(new NpgsqlParameter("city",  NpgsqlDbType.Text)    { Value = (object?)metadata.City            ?? DBNull.Value });
            upd.Parameters.Add(new NpgsqlParameter("camt",  NpgsqlDbType.Numeric) { Value = (object?)metadata.ClaimedAmount   ?? DBNull.Value });
            upd.Parameters.Add(new NpgsqlParameter("cdte",  NpgsqlDbType.Date)    { Value = metadata.ClaimedDate.HasValue ? (object)metadata.ClaimedDate.Value.ToDateTime(TimeOnly.MinValue) : DBNull.Value });
            upd.Parameters.Add(new NpgsqlParameter("cmer",  NpgsqlDbType.Text)    { Value = (object?)metadata.ClaimedMerchant ?? DBNull.Value });
            upd.Parameters.Add(new NpgsqlParameter("cgst",  NpgsqlDbType.Text)    { Value = (object?)metadata.ClaimedGstin    ?? DBNull.Value });
            upd.Parameters.Add(new NpgsqlParameter("ename", NpgsqlDbType.Text)    { Value = (object?)metadata.EmployeeName    ?? DBNull.Value });
            upd.Parameters.Add(new NpgsqlParameter("dept",  NpgsqlDbType.Text)    { Value = (object?)metadata.Department      ?? DBNull.Value });
            upd.Parameters.Add(new NpgsqlParameter("id",    NpgsqlDbType.Uuid)    { Value = expenseId });
            await upd.ExecuteNonQueryAsync(ct);
        }

        return expenseId;
    }

    private static bool HasAny(SubmissionMetadata m) =>
        m.Category is not null || m.PaymentMode is not null || m.Purpose is not null ||
        m.City is not null || m.ClaimedAmount is not null || m.ClaimedDate is not null ||
        m.ClaimedMerchant is not null || m.ClaimedGstin is not null ||
        m.EmployeeName is not null || m.Department is not null;

    public Task<Expense?> GetByRefIdAsync(string refId, CancellationToken ct) =>
        _db.Expenses.AsNoTracking().FirstOrDefaultAsync(e => e.RefId == refId, ct);

    public Task<Expense?> GetByIdAsync(Guid id, CancellationToken ct) =>
        _db.Expenses.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, ct);

    public async Task<ReceiptFileRef?> GetReceiptRefAsync(string refId, CancellationToken ct)
    {
        var row = await (
            from e in _db.Expenses.AsNoTracking()
            join r in _db.ReceiptFiles.AsNoTracking() on e.Id equals r.ExpenseId
            where e.RefId == refId
            select new { r.StoragePath, r.ContentType })
            .FirstOrDefaultAsync(ct);
        return row is null ? null : new ReceiptFileRef(row.StoragePath, row.ContentType);
    }

    public async Task<IReadOnlyList<Expense>> GetRecentForUserAsync(Guid userId, int limit, CancellationToken ct) =>
        await _db.Expenses.AsNoTracking()
            .Where(e => e.UserId == userId)
            .OrderByDescending(e => e.SubmittedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<ExpenseWithUserEmail>> GetByStatusWithUserEmailAsync(
        ExpenseStatus status, int limit, int offset, CancellationToken ct)
    {
        var rows = await (
            from e in _db.Expenses.AsNoTracking()
            join u in _db.Users.AsNoTracking() on e.UserId equals u.Id
            where e.Status == status
            orderby e.SubmittedAt descending
            select new { Expense = e, u.Email })
            .Skip(offset)
            .Take(limit)
            .ToListAsync(ct);

        return rows.Select(r => new ExpenseWithUserEmail(r.Expense, r.Email)).ToList();
    }

    public async Task UpdateResultAsync(
        Guid expenseId, ExpenseStatus status, decimal overallConfidence, bool needsReview,
        string? reviewReason, string resultJson, CancellationToken ct)
    {
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = (NpgsqlCommand)conn.CreateCommand();
        cmd.CommandText = @"UPDATE expenses
            SET status              = @status::expense_status,
                overall_confidence  = @conf,
                needs_review        = @review,
                review_reason       = @reason,
                result              = @result::jsonb,
                completed_at        = NOW()
          WHERE id = @id";
        cmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Text)    { Value = ToDb(status) });
        cmd.Parameters.Add(new NpgsqlParameter("conf",   NpgsqlDbType.Numeric) { Value = overallConfidence });
        cmd.Parameters.Add(new NpgsqlParameter("review", NpgsqlDbType.Boolean) { Value = needsReview });
        cmd.Parameters.Add(new NpgsqlParameter("reason", NpgsqlDbType.Text)    { Value = (object?)reviewReason ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("result", NpgsqlDbType.Text)    { Value = resultJson });
        cmd.Parameters.Add(new NpgsqlParameter("id",     NpgsqlDbType.Uuid)    { Value = expenseId });
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task UpdateStatusOnlyAsync(Guid expenseId, ExpenseStatus status, CancellationToken ct)
    {
        await _db.Database.ExecuteSqlRawAsync(
            "UPDATE expenses SET status = {0}::expense_status, completed_at = NOW() WHERE id = {1}",
            ToDb(status), expenseId);
    }

    public async Task<decimal> GetDailyTotalExcludingRejectedAsync(
        Guid userId, DateOnly date, Guid excludeExpenseId, CancellationToken ct)
    {
        var dayStart = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var dayEnd   = dayStart.AddDays(1);
        return await _db.Expenses.AsNoTracking()
            .Where(e => e.UserId == userId
                && e.Id != excludeExpenseId
                && e.Status != ExpenseStatus.Rejected
                && e.SubmittedAt >= dayStart
                && e.SubmittedAt <  dayEnd)
            .SumAsync(e => e.ClaimedAmount ?? 0m, ct);
    }

    private static string ToDb(ExpenseStatus s) => s switch
    {
        ExpenseStatus.Processing    => "processing",
        ExpenseStatus.Approved      => "approved",
        ExpenseStatus.NeedsReview   => "needs_review",
        ExpenseStatus.Rejected      => "rejected",
        ExpenseStatus.Failed        => "failed",
        _                           => s.ToString().ToLowerInvariant()
    };
}
