using FluentValidation;

namespace Uc10.Application.Admin;

public class UpdateThresholdRequestValidator : AbstractValidator<UpdateThresholdRequest>
{
    public UpdateThresholdRequestValidator()
    {
        RuleFor(x => x.Value).GreaterThanOrEqualTo(0m).LessThanOrEqualTo(10_000_000m);
    }
}

public class PolicyRuleRequestValidator : AbstractValidator<PolicyRuleRequest>
{
    private static readonly HashSet<string> ValidTypes =
        new(StringComparer.OrdinalIgnoreCase) { "amount_cap", "category_block", "require_gstin", "time_window", "fuzzy" };

    public PolicyRuleRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(80).Matches(@"^[a-z0-9_]+$");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.Type).NotEmpty().Must(t => ValidTypes.Contains(t))
            .WithMessage($"type must be one of: {string.Join(", ", ValidTypes)}");
        RuleFor(x => x.Severity).NotEmpty().Must(s => s is "low" or "medium" or "high");
        RuleFor(x => x.ParamsJson).NotEmpty().Must(BeValidJsonObject)
            .WithMessage("paramsJson must be a JSON object");
    }

    private static bool BeValidJsonObject(string s)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(s);
            return doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object;
        }
        catch { return false; }
    }
}

public class ReviewDecisionRequestValidator : AbstractValidator<ReviewDecisionRequest>
{
    public ReviewDecisionRequestValidator()
    {
        RuleFor(x => x.Note).MaximumLength(1000);
    }
}
