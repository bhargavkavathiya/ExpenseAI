namespace Uc10.Domain.ValueObjects;

public readonly record struct ConfidenceScore
{
    public decimal Value { get; }

    public ConfidenceScore(decimal value)
    {
        if (value < 0m || value > 1m)
            throw new ArgumentOutOfRangeException(nameof(value), value, "confidence must be in [0, 1]");
        Value = Math.Round(value, 4, MidpointRounding.AwayFromZero);
    }

    public static ConfidenceScore Zero => new(0m);
    public static ConfidenceScore One  => new(1m);

    public override string ToString() => Value.ToString("0.0000");
    public static implicit operator decimal(ConfidenceScore c) => c.Value;
}
