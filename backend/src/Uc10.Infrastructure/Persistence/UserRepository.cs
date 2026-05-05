using Microsoft.EntityFrameworkCore;
using Uc10.Application.Abstractions;
using Uc10.Domain.Entities;

namespace Uc10.Infrastructure.Persistence;

public class UserRepository : IUserRepository
{
    private readonly Uc10DbContext _db;

    public UserRepository(Uc10DbContext db) => _db = db;

    public Task<User?> FindByEmailAsync(string email, CancellationToken ct)
    {
        var normalized = email.Trim().ToLowerInvariant();
        return _db.Users
            .AsNoTracking()
            .Where(u => u.Email.ToLower() == normalized)
            .FirstOrDefaultAsync(ct);
    }

    public Task<User?> FindByEmployeeIdAsync(string employeeId, CancellationToken ct) =>
        _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.EmployeeId == employeeId, ct);

    public Task<User?> FindByIdAsync(Guid id, CancellationToken ct) =>
        _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id, ct);

    public async Task<IReadOnlyCollection<string>> GetRoleNamesAsync(Guid userId, CancellationToken ct) =>
        await _db.UserRoles
            .AsNoTracking()
            .Where(ur => ur.UserId == userId)
            .Join(_db.Roles, ur => ur.RoleId, r => r.Id, (_, r) => r.Name)
            .ToListAsync(ct);

    public async Task<User> CreateAsync(User user, string defaultRoleName, CancellationToken ct)
    {
        var strategy = _db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async token =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync(token);

            _db.Users.Add(user);
            await _db.SaveChangesAsync(token);

            var role = await _db.Roles.FirstOrDefaultAsync(r => r.Name == defaultRoleName, token)
                       ?? throw new InvalidOperationException($"role '{defaultRoleName}' not seeded");
            _db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = role.Id });
            await _db.SaveChangesAsync(token);

            await tx.CommitAsync(token);
            return user;
        }, ct);
    }
}

public class EmployeeBandRepository : IEmployeeBandRepository
{
    private readonly Uc10DbContext _db;

    public EmployeeBandRepository(Uc10DbContext db) => _db = db;

    public async Task<IReadOnlyList<EmployeeBand>> GetActiveOrderedAsync(CancellationToken ct) =>
        await _db.EmployeeBands
            .AsNoTracking()
            .Where(b => b.Active)
            .OrderBy(b => b.RankOrder).ThenBy(b => b.Code)
            .ToListAsync(ct);

    public Task<EmployeeBand?> GetByCodeAsync(string code, CancellationToken ct) =>
        _db.EmployeeBands.AsNoTracking().FirstOrDefaultAsync(b => b.Code == code, ct);

    public async Task UpdateAsync(EmployeeBand band, CancellationToken ct)
    {
        var tracked = await _db.EmployeeBands.FirstOrDefaultAsync(b => b.Code == band.Code, ct)
            ?? throw new KeyNotFoundException($"band '{band.Code}' not found");
        tracked.Allowances = band.Allowances;
        tracked.UpdatedBy = band.UpdatedBy;
        tracked.UpdatedAt = band.UpdatedAt;
        // We deliberately don't let allowance edits change name/rank/description —
        // those are managed in seed files and the admin UI only edits the allowance table.
        await _db.SaveChangesAsync(ct);
    }
}
