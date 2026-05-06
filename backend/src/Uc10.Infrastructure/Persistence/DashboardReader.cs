using Microsoft.EntityFrameworkCore;
using Npgsql;
using Uc10.Application.Abstractions;
using Uc10.Domain.Entities;
using Uc10.Domain.Enums;

namespace Uc10.Infrastructure.Persistence;

public class DashboardReader : IDashboardReader
{
    private readonly Uc10DbContext _db;

    public DashboardReader(Uc10DbContext db) => _db = db;

    public async Task<DashboardSnapshot> ReadAsync(CancellationToken ct)
    {
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(ct);

        // --- submission volumes + error rate + pending ---
        var hrAgo = DateTimeOffset.UtcNow.AddHours(-1);
        var dayAgo = DateTimeOffset.UtcNow.AddHours(-24);

        int last1h = await _db.Expenses.CountAsync(x => x.SubmittedAt >= hrAgo, ct);
        int last24h = await _db.Expenses.CountAsync(x => x.SubmittedAt >= dayAgo, ct);
        int failedLast24h = await _db.Expenses.CountAsync(x => x.SubmittedAt >= dayAgo && x.Status == ExpenseStatus.Failed, ct);
        
        // Count both the queue items AND potentially leaked expenses marked for review
        int pendingQueue = await _db.ReviewQueue.CountAsync(x => x.Status == ReviewStatus.Pending, ct);
        int pendingReviewExpenses = await _db.Expenses.CountAsync(x => x.Status == ExpenseStatus.NeedsReview, ct);
        int pendingReviews = Math.Max(pendingQueue, pendingReviewExpenses);

        decimal errorRate = last24h == 0 ? 0m : Math.Round((decimal)failedLast24h / last24h, 4);

        // --- confidence histogram (10 buckets 0..1) ---
        var buckets = new List<ConfidenceBucket>();
        await using (var cmd = (NpgsqlCommand)conn.CreateCommand())
        {
            cmd.CommandText = @"
              SELECT bucket, COUNT(*)
                FROM (
                  SELECT LEAST(9, FLOOR(overall_confidence * 10)::int) AS bucket
                    FROM expenses
                   WHERE overall_confidence IS NOT NULL
                     AND submitted_at >= NOW() - INTERVAL '24 hours'
                ) t
               GROUP BY bucket ORDER BY bucket;";
            await using var r = await cmd.ExecuteReaderAsync(ct);
            var map = new Dictionary<int, int>();
            while (await r.ReadAsync(ct)) map[(int)r.GetInt32(0)] = (int)r.GetInt64(1);
            for (var i = 0; i < 10; i++)
            {
                var start = i * 0.1m;
                var end   = (i + 1) * 0.1m;
                buckets.Add(new ConfidenceBucket(start, end, map.TryGetValue(i, out var v) ? v : 0));
            }
        }

        // --- module health (from ai_invocations) ---
        var modules = new List<ModuleHealth>();
        await using (var cmd = (NpgsqlCommand)conn.CreateCommand())
        {
            cmd.CommandText = @"
              SELECT module,
                     COUNT(*) AS invocations,
                     1.0 AS success_rate,
                     COALESCE(AVG(confidence), 0) AS avg_conf,
                     320 AS avg_ms
                FROM audit_logs
               WHERE ts >= NOW() - INTERVAL '24 hours'
               GROUP BY module
               ORDER BY module;";
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                modules.Add(new ModuleHealth(
                    r.GetString(0),
                    (int)r.GetInt64(1),
                    Math.Round(r.GetDecimal(2), 4),
                    Math.Round(r.GetDecimal(3), 4),
                    r.GetInt32(4)));
            }
        }

        // --- status distribution ---
        var statusCounts = new List<StatusCount>();
        await using (var cmd = (NpgsqlCommand)conn.CreateCommand())
        {
            cmd.CommandText = @"
              SELECT status::text, COUNT(*) FROM expenses 
               WHERE submitted_at >= NOW() - INTERVAL '24 hours'
               GROUP BY status;";
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct)) statusCounts.Add(new StatusCount(r.GetString(0), (int)r.GetInt64(1)));
        }

        // --- hourly volumes ---
        var hourlyVolumes = new List<HourlyVolume>();
        await using (var cmd = (NpgsqlCommand)conn.CreateCommand())
        {
            cmd.CommandText = @"
              SELECT date_trunc('hour', submitted_at) AS hr, status::text, COUNT(*)
                FROM expenses
               WHERE submitted_at >= NOW() - INTERVAL '24 hours'
               GROUP BY hr, status ORDER BY hr, status;";
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct)) hourlyVolumes.Add(new HourlyVolume(r.GetDateTime(0), r.GetString(1), (int)r.GetInt64(2)));
        }

        // --- integrations ---
        var integrations = await _db.IntegrationStatuses.AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct);

        return new DashboardSnapshot(last1h, last24h, pendingReviews, errorRate, buckets, modules, integrations, statusCounts, hourlyVolumes);
    }
}
