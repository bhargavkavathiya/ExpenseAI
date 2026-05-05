using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Uc10.Application.Abstractions;

namespace Uc10.Infrastructure.Persistence;

public class ThresholdRepository : IThresholdRepository
{
    private readonly Uc10DbContext _db;
    public ThresholdRepository(Uc10DbContext db) => _db = db;

    public async Task<IReadOnlyDictionary<string, decimal>> GetAllAsync(CancellationToken ct) =>
        await _db.Thresholds.AsNoTracking().ToDictionaryAsync(t => t.Key, t => t.Value, ct);

    public async Task<decimal?> GetAsync(string key, CancellationToken ct) =>
        (await _db.Thresholds.AsNoTracking().Where(t => t.Key == key).Select(t => (decimal?)t.Value).FirstOrDefaultAsync(ct));

    public async Task<decimal> UpdateAsync(string key, decimal value, Guid updatedBy, CancellationToken ct)
    {
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(ct);

        await using var cmd = (NpgsqlCommand)conn.CreateCommand();
        cmd.CommandText = "SELECT sp_update_threshold(@k, @v, @by)";
        cmd.Parameters.Add(new NpgsqlParameter("k",  NpgsqlDbType.Text)    { Value = key });
        cmd.Parameters.Add(new NpgsqlParameter("v",  NpgsqlDbType.Numeric) { Value = value });
        cmd.Parameters.Add(new NpgsqlParameter("by", NpgsqlDbType.Uuid)    { Value = updatedBy });
        var result = await cmd.ExecuteScalarAsync(ct);
        return (decimal)result!;
    }
}
