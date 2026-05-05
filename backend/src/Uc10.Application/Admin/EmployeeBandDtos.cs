using FluentValidation;

namespace Uc10.Application.Admin;

// Typed shape the admin UI renders in the "Band-wise Allowance Configuration" table.
// Stored in the JSONB allowances column on employee_bands. Keys match the column
// headers in the admin screen so the JSON can be eyeballed without a mapping layer.
public record BandAllowances(
    decimal DailyLimit,
    decimal MealsLimit,
    decimal HotelLimit,
    decimal FuelLimit,
    decimal MgrReviewThreshold);

public record EmployeeBandWithAllowancesDto(
    string Code,
    string Name,
    string Description,
    int RankOrder,
    bool Active,
    BandAllowances Allowances);

public record UpdateBandAllowancesRequest(string Code, BandAllowances Allowances);

public record UpdateAllBandAllowancesRequest(IReadOnlyList<UpdateBandAllowancesRequest> Bands);

public class BandAllowancesValidator : AbstractValidator<BandAllowances>
{
    public BandAllowancesValidator()
    {
        // Each cap must be a non-negative INR amount. 10 cr is a generous upper bound
        // to catch fat-finger errors (e.g. trailing 000 pasted into the form).
        RuleFor(x => x.DailyLimit).InclusiveBetween(0m, 100_000_000m);
        RuleFor(x => x.MealsLimit).InclusiveBetween(0m, 100_000_000m);
        RuleFor(x => x.HotelLimit).InclusiveBetween(0m, 100_000_000m);
        RuleFor(x => x.FuelLimit).InclusiveBetween(0m, 100_000_000m);
        RuleFor(x => x.MgrReviewThreshold).InclusiveBetween(0m, 100_000_000m);
    }
}

public class UpdateBandAllowancesRequestValidator : AbstractValidator<UpdateBandAllowancesRequest>
{
    public UpdateBandAllowancesRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(16).Matches(@"^[A-Za-z0-9_-]+$");
        RuleFor(x => x.Allowances).NotNull().SetValidator(new BandAllowancesValidator());
    }
}

public class UpdateAllBandAllowancesRequestValidator : AbstractValidator<UpdateAllBandAllowancesRequest>
{
    public UpdateAllBandAllowancesRequestValidator()
    {
        RuleFor(x => x.Bands).NotEmpty().Must(l => l.Count <= 100);
        RuleForEach(x => x.Bands).SetValidator(new UpdateBandAllowancesRequestValidator());
    }
}
