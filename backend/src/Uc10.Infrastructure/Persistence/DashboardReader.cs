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

        // --- submission volumes + error rate ---
        int last1h = 0, last24h = 0, failedLast24h = 0;
        await using (var cmd = (NpgsqlCommand)conn.CreateCommand())
        {
            cmd.CommandText = @"
              SELECT
                COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '1 hour')  AS c1h,
                COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '24 hours') AS c24h,
                COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '24 hours' AND status = 'failed') AS fail24h
              FROM expenses;";
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                last1h         = (int)r.GetInt64(0);
                last24h        = (int)r.GetInt64(1);
                failedLast24h  = (int)r.GetInt64(2);
            }
        }
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
                     COALESCE(AVG(CASE WHEN status = 'ok' THEN 1.0 ELSE 0.0 END), 0) AS success_rate,
                     COALESCE(AVG(confidence), 0) AS avg_conf,
                     COALESCE(AVG(duration_ms), 0)::int AS avg_ms
                FROM ai_invocations
               WHERE created_at >= NOW() - INTERVAL '24 hours'
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

        // --- integrations ---
        var integrations = await _db.IntegrationStatuses.AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct);

        return new DashboardSnapshot(last1h, last24h, errorRate, buckets, modules, integrations);
    }
}
