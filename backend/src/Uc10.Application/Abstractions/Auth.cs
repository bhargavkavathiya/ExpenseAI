using Uc10.Domain.Entities;

namespace Uc10.Application.Abstractions;

public interface IPasswordHasher
{
    string Hash(string plainText);
    bool Verify(string plainText, string hash);
}

public interface ITokenIssuer
{
    (string AccessToken, DateTimeOffset ExpiresAt) Issue(User user, IReadOnlyCollection<string> roles);
}

public interface IUserRepository
{
    Task<User?> FindByEmailAsync(string email, CancellationToken ct);
    Task<User?> FindByEmployeeIdAsync(string employeeId, CancellationToken ct);
    Task<User?> FindByIdAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyCollection<string>> GetRoleNamesAsync(Guid userId, CancellationToken ct);
    Task<User> CreateAsync(User user, string defaultRoleName, CancellationToken ct);
}

public interface IEmployeeBandRepository
{
    Task<IReadOnlyList<EmployeeBand>> GetActiveOrderedAsync(CancellationToken ct);
    Task<EmployeeBand?> GetByCodeAsync(string code, CancellationToken ct);
    Task UpdateAsync(EmployeeBand band, CancellationToken ct);
}
