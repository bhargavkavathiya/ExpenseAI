using System.Text.RegularExpressions;

namespace Uc10.Domain.ValueObjects;

// EXP-YYYY-MM-XXXX-XXXX — year+month from submission timestamp, last two
// segments are 4-char base32-ish tokens for readability. Kept as a value
// object so generators, parsers, and validators agree on the single format.
public readonly record struct ReferenceId
{
    public static readonly Regex Pattern = new(
        @"^EXP-\d{4}-\d{2}-[A-Z0-9]{4}-[A-Z0-9]{4}$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public string Value { get; }

    private ReferenceId(string value) => Value = value;

    public static ReferenceId Parse(string raw)
    {
        if (!Pattern.IsMatch(raw))
            throw new FormatException($"invalid reference id: '{raw}'");
        return new ReferenceId(raw);
    }

    public static bool TryParse(string? raw, out ReferenceId refId)
    {
        if (raw is not null && Pattern.IsMatch(raw))
        {
            refId = new ReferenceId(raw);
            return true;
        }
        refId = default;
        return false;
    }

    public override string ToString() => Value;

    public static implicit operator string(ReferenceId r) => r.Value;
}
