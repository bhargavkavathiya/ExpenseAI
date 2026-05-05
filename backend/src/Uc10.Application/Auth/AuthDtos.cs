namespace Uc10.Application.Auth;

public record EmployeeProfileRequest(
    string? EmployeeId,
    string? FullName,
    string? Mobile,
    string? Department,
    string? ManagerName,
    string? Band,
    string? RegistrationSource,
    string? Location,
    string? CostCenter
);

public record RegisterRequest(
    string Email,
    string Password,
    EmployeeProfileRequest? Profile = null
);

public record LoginRequest(string Email, string Password);

public record EmployeeProfileDto(
    string? EmployeeId,
    string? FullName,
    string? Mobile,
    string? Department,
    string? ManagerName,
    string? Band,
    string? RegistrationSource,
    string? Location,
    string? CostCenter
);

public record UserDto(
    Guid Id,
    string Email,
    IReadOnlyCollection<string> Roles,
    DateTimeOffset CreatedAt,
    EmployeeProfileDto? Profile
);

public record LoginResponse(string AccessToken, string TokenType, DateTimeOffset ExpiresAt, UserDto User)
{
    public static LoginResponse From(string token, DateTimeOffset expiresAt, UserDto user) =>
        new(token, "Bearer", expiresAt, user);
}
