namespace Uc10.Domain.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = default!;
    public string PasswordHash { get; set; } = default!;

    // Employee profile — all optional so legacy seeded accounts keep working.
    public string? EmployeeId { get; set; }
    public string? FullName { get; set; }
    public string? Mobile { get; set; }
    public string? Department { get; set; }
    public string? ManagerName { get; set; }
    public string? Band { get; set; }                 // references employee_bands.code
    public string? RegistrationSource { get; set; }
    public string? Location { get; set; }
    public string? CostCenter { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public List<UserRole> UserRoles { get; set; } = new();
}

public class UserRole
{
    public Guid UserId { get; set; }
    public short RoleId { get; set; }
    public User Role_User { get; set; } = default!;
    public Role Role { get; set; } = default!;
}

public class EmployeeBand
{
    public string Code { get; set; } = default!;
    public string Name { get; set; } = default!;
    public string Description { get; set; } = "";
    public int RankOrder { get; set; }
    public bool Active { get; set; } = true;
    public string Allowances { get; set; } = "{}";  // JSONB serialized; typed object in DTO layer
    public Guid? UpdatedBy { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
