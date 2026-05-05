using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Uc10.Infrastructure.Persistence;

// Re-applies the demo-user seed at every backend startup, idempotently.
//
// Why this exists: Postgres's /docker-entrypoint-initdb.d/ scripts only run
// on a freshly-created data volume. On the hackathon portal, a redeploy
// that reuses the same postgres volume will SKIP the init seeds — so the
// demo accounts (admin/compliance/analyst/customer @demo.local) silently
// disappear and login fails. This service patches that gap by upserting
// the same rows over an existing connection at app boot.
//
// Safe to run on every start: every statement is idempotent
// (`ON CONFLICT DO NOTHING`). On a fresh DB it's a no-op because
// 07-seed-demo-users.sql will already have inserted the same rows.
//
// The bcrypt hashes here MUST match 07-seed-demo-users.sql exactly so the
// canonical source-of-truth is the SQL file; this is just a runtime mirror.
public class DemoUserSeeder : IHostedService
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<DemoUserSeeder> _log;

    public DemoUserSeeder(NpgsqlDataSource dataSource, ILogger<DemoUserSeeder> log)
    {
        _dataSource = dataSource;
        _log = log;
    }

    public async Task StartAsync(CancellationToken ct)
    {
        try
        {
            await using var conn = await _dataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = SeedSql;
            var rows = await cmd.ExecuteNonQueryAsync(ct);
            _log.LogInformation("Demo user seed applied (statements affecting up to {Rows} rows total).", rows);
        }
        catch (Exception ex)
        {
            // Never block app startup if seeding fails — the existing init
            // scripts may have already done the job, and surfacing this as a
            // crash would prevent the API from coming up at all.
            _log.LogWarning(ex, "Demo user seed failed; skipping. Login may not work for demo accounts.");
        }
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

    // Mirrors database/init/04-seed-roles.sql + 07-seed-demo-users.sql.
    private const string SeedSql = @"
        INSERT INTO roles (name, description) VALUES
            ('customer',   'Employee submitting expense receipts'),
            ('analyst',    'Financial analyst handling review queue'),
            ('compliance', 'Compliance officer tuning thresholds and exporting audit logs'),
            ('admin',      'System administrator with full access')
        ON CONFLICT (name) DO NOTHING;

        -- The schema enforces uniqueness via `CREATE UNIQUE INDEX ux_users_email_lower
        -- ON users (LOWER(email))`, not a plain UNIQUE on the column. Postgres' ON
        -- CONFLICT requires a column or expression that exactly matches an index, so
        -- we drive the upsert via WHERE NOT EXISTS instead — which works regardless.
        INSERT INTO users (email, password_hash)
        SELECT v.email, v.password_hash
          FROM (VALUES
            ('admin@demo.local',      '$2b$10$kHmBHbpK0lYWYOTU6z3wdOdq6SPQnKDyLCmkFtfuVYaYMTpfBf0Tq'),
            ('compliance@demo.local', '$2b$10$RQXHqqq3Dw6HdZGzBH4pG.HL9BwfDDio2Jtkfp6DORk/BTVwMu.Qi'),
            ('analyst@demo.local',    '$2b$10$9frbcfKqgFF3NqdiQyFI.uPTUXLecQ24W8bawsRleY6siZ84DAKOu'),
            ('customer@demo.local',   '$2b$10$HzsOQjT8J.de7yu6wuepuuBzf30wfYf8JHBpDVhUekIXg/JxecTxS')
          ) AS v(email, password_hash)
         WHERE NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(v.email));

        INSERT INTO user_roles (user_id, role_id)
        SELECT u.id, r.id
          FROM users u
          JOIN roles r ON (
                 (u.email = 'admin@demo.local'      AND r.name = 'admin')
              OR (u.email = 'compliance@demo.local' AND r.name = 'compliance')
              OR (u.email = 'analyst@demo.local'    AND r.name = 'analyst')
              OR (u.email = 'customer@demo.local'   AND r.name = 'customer')
          )
        ON CONFLICT DO NOTHING;
    ";
}
