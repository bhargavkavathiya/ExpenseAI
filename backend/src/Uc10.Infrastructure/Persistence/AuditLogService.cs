using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Uc10.Application.Abstractions;
using Uc10.Domain.Entities;

namespace Uc10.Infrastructure.Persistence;

// Writes via sp_insert_audit_log_with_hash so the hash chain and seq are
// guaranteed consistent regardless of concurrent writes.
public class AuditLogService : IAuditLogService
{
    private readonly Uc10DbContext _db;

    public AuditLogService(Uc10DbContext db) => _db = db;

    public async Task<AuditAppendResult> AppendAsync(
        Guid? userId, Guid? expenseId, string module, string modelVersion,
        string? promptVersion, string? inputRef, string outputSnapshotJson,
        decimal? confidence, CancellationToken ct)
    {
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(ct);

        await using var cmd = (NpgsqlCommand)conn.CreateCommand();
        cmd.CommandText =
            @"SELECT out_id, out_seq, out_hash
                FROM sp_insert_audit_log_with_hash(
                  @user, @exp, @mod, @model, @prompt, @input, @output::jsonb, @conf);";

        cmd.Parameters.Add(new NpgsqlParameter("user",   NpgsqlDbType.Uuid)      { Value = (object?)userId    ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("exp",    NpgsqlDbType.Uuid)      { Value = (object?)expenseId ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("mod",    NpgsqlDbType.Text)      { Value = module });
        cmd.Parameters.Add(new NpgsqlParameter("model",  NpgsqlDbType.Text)      { Value = modelVersion });
        cmd.Parameters.Add(new NpgsqlParameter("prompt", NpgsqlDbType.Text)      { Value = (object?)promptVersion ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("input",  NpgsqlDbType.Text)      { Value = (object?)inputRef      ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("output", NpgsqlDbType.Text)      { Value = outputSnapshotJson });
        cmd.Parameters.Add(new NpgsqlParameter("conf",   NpgsqlDbType.Numeric)   { Value = (object?)confidence    ?? DBNull.Value });

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct))
            throw new InvalidOperationException("sp_insert_audit_log_with_hash returned no row");

        var id = r.GetGuid(0);
        var seq = r.GetInt64(1);
        var hash = r.GetString(2);
        return new AuditAppendResult(id, seq, hash);
    }

    public async Task<IReadOnlyList<AuditLog>> QueryAsync(
        DateTimeOffset? from, DateTimeOffset? to, string? module, Guid? userId,
        int limit, int offset, CancellationToken ct)
    {
        var q = _db.AuditLogs.AsNoTracking().AsQueryable();
        if (from is not null)   q = q.Where(a => a.Ts >= from);
        if (to   is not null)   q = q.Where(a => a.Ts <  to);
        if (!string.IsNullOrEmpty(module)) q = q.Where(a => a.Module == module);
        if (userId is Guid u)   q = q.Where(a => a.UserId == u);
        return await q.OrderBy(a => a.Seq).Skip(offset).Take(limit).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<AuditChainDivergence>> VerifyChainAsync(CancellationToken ct)
    {
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(ct);

        await using var cmd = (NpgsqlCommand)conn.CreateCommand();
        cmd.CommandText = "SELECT seq_out, expected_hash, actual_hash FROM fn_verify_audit_chain() WHERE ok = FALSE";

        var list = new List<AuditChainDivergence>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            list.Add(new AuditChainDivergence(r.GetInt64(0), r.GetString(1), r.GetString(2)));
        return list;
    }
}
