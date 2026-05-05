using Uc10.Application.Abstractions;
using Uc10.Domain.Abstractions;
using Uc10.Domain.Entities;
using Uc10.Domain.Enums;

namespace Uc10.Application.Auth;

public class InvalidCredentialsException : Exception
{
    public InvalidCredentialsException() : base("invalid credentials") { }
}

public class EmailAlreadyRegisteredException : Exception
{
    public EmailAlreadyRegisteredException(string email) : base($"email '{email}' is already registered") { }
}

public class EmployeeIdAlreadyInUseException : Exception
{
    public EmployeeIdAlreadyInUseException(string empId) : base($"employee id '{empId}' is already in use") { }
}

public class AuthService
{
    private readonly IUserRepository _users;
    private readonly IPasswordHasher _hasher;
    private readonly ITokenIssuer _tokens;
    private readonly IClock _clock;

    public AuthService(IUserRepository users, IPasswordHasher hasher, ITokenIssuer tokens, IClock clock)
    {
        _users = users;
        _hasher = hasher;
        _tokens = tokens;
        _clock = clock;
    }

    public async Task<LoginResponse> RegisterAsync(RegisterRequest req, CancellationToken ct)
    {
        var existingEmail = await _users.FindByEmailAsync(req.Email, ct);
        if (existingEmail is not null) throw new EmailAlreadyRegisteredException(req.Email);

        if (!string.IsNullOrWhiteSpace(req.Profile?.EmployeeId))
        {
            var existingEmp = await _users.FindByEmployeeIdAsync(req.Profile!.EmployeeId!, ct);
            if (existingEmp is not null) throw new EmployeeIdAlreadyInUseException(req.Profile.EmployeeId!);
        }

        var p = req.Profile;
        var user = new User
        {
            Id           = Guid.NewGuid(),
            Email        = req.Email.Trim().ToLowerInvariant(),
            PasswordHash = _hasher.Hash(req.Password),
            CreatedAt    = _clock.UtcNow,
            UpdatedAt    = _clock.UtcNow,

            EmployeeId         = NullIfBlank(p?.EmployeeId),
            FullName           = NullIfBlank(p?.FullName),
            Mobile             = NullIfBlank(p?.Mobile),
            Department         = NullIfBlank(p?.Department),
            ManagerName        = NullIfBlank(p?.ManagerName),
            Band               = NullIfBlank(p?.Band),
            RegistrationSource = NullIfBlank(p?.RegistrationSource) ?? "web",
            Location           = NullIfBlank(p?.Location),
            CostCenter         = NullIfBlank(p?.CostCenter)
        };

        var saved = await _users.CreateAsync(user, RoleNames.Customer, ct);
        var roles = await _users.GetRoleNamesAsync(saved.Id, ct);
        var (token, expires) = _tokens.Issue(saved, roles);

        return LoginResponse.From(token, expires, Map(saved, roles));
    }

    public async Task<LoginResponse> LoginAsync(LoginRequest req, CancellationToken ct)
    {
        var user = await _users.FindByEmailAsync(req.Email, ct);
        if (user is null || !_hasher.Verify(req.Password, user.PasswordHash))
            throw new InvalidCredentialsException();

        var roles = await _users.GetRoleNamesAsync(user.Id, ct);
        var (token, expires) = _tokens.Issue(user, roles);

        return LoginResponse.From(token, expires, Map(user, roles));
    }

    public async Task<UserDto> GetMeAsync(Guid userId, CancellationToken ct)
    {
        var user = await _users.FindByIdAsync(userId, ct) ?? throw new InvalidCredentialsException();
        var roles = await _users.GetRoleNamesAsync(user.Id, ct);
        return Map(user, roles);
    }

    private static UserDto Map(User u, IReadOnlyCollection<string> roles) => new(
        u.Id, u.Email, roles, u.CreatedAt,
        u.EmployeeId is null && u.FullName is null && u.Band is null
            ? null
            : new EmployeeProfileDto(
                u.EmployeeId, u.FullName, u.Mobile, u.Department, u.ManagerName,
                u.Band, u.RegistrationSource, u.Location, u.CostCenter));

    private static string? NullIfBlank(string? s) =>
        string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
