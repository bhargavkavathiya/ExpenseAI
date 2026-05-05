using FluentValidation;

namespace Uc10.Application.Auth;

public class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(256);
        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(8)
            .MaximumLength(128);
        When(x => x.Profile is not null, () =>
            RuleFor(x => x.Profile!).SetValidator(new EmployeeProfileRequestValidator()));
    }
}

public class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(128);
    }
}

public class EmployeeProfileRequestValidator : AbstractValidator<EmployeeProfileRequest>
{
    // Registration source stays a small controlled set so the admin UI can filter cleanly.
    private static readonly HashSet<string> Sources =
        new(StringComparer.OrdinalIgnoreCase) { "web", "mobile", "admin", "hris" };

    public EmployeeProfileRequestValidator()
    {
        // Employee id: letters + digits + '-' up to 32; allows EMP1001, EMP-001, ACME-EN-1234, etc.
        RuleFor(x => x.EmployeeId)
            .MaximumLength(32)
            .Matches(@"^[A-Za-z0-9\-]+$")
            .When(x => !string.IsNullOrWhiteSpace(x.EmployeeId));

        RuleFor(x => x.FullName).MaximumLength(120);

        // Mobile: digits, optional leading +, optional single space. Keeps things simple and
        // Indian-format-friendly (+91 9XXXXXXXXX) without rejecting other locales.
        RuleFor(x => x.Mobile)
            .Matches(@"^\+?[0-9\s\-]{7,16}$")
            .When(x => !string.IsNullOrWhiteSpace(x.Mobile));

        RuleFor(x => x.Department).MaximumLength(80);
        RuleFor(x => x.ManagerName).MaximumLength(120);
        RuleFor(x => x.Band).MaximumLength(16);        // FK-style code; cross-checked in service
        RuleFor(x => x.Location).MaximumLength(80);
        RuleFor(x => x.CostCenter).MaximumLength(40);

        RuleFor(x => x.RegistrationSource)
            .Must(s => string.IsNullOrWhiteSpace(s) || Sources.Contains(s))
            .WithMessage($"registrationSource must be one of: {string.Join(", ", Sources)}");
    }
}
