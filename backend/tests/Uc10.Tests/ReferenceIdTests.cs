using FluentAssertions;
using Uc10.Domain.ValueObjects;
using Xunit;

namespace Uc10.Tests;

public class ReferenceIdTests
{
    [Theory]
    [InlineData("EXP-2026-04-ABCD-1234")]
    [InlineData("EXP-2026-12-Z9P7-R2QK")]
    public void TryParse_accepts_valid(string s)
    {
        ReferenceId.TryParse(s, out var r).Should().BeTrue();
        r.Value.Should().Be(s);
    }

    [Theory]
    [InlineData("")]
    [InlineData("EXP-26-04-ABCD-1234")]           // year too short
    [InlineData("EXP-2026-4-ABCD-1234")]          // month not padded
    [InlineData("EXP-2026-04-ABCD")]              // missing segment
    [InlineData("exp-2026-04-ABCD-1234")]         // wrong prefix case
    [InlineData("EXP-2026-04-abcd-1234")]         // lowercase letters
    public void TryParse_rejects_invalid(string s)
        => ReferenceId.TryParse(s, out _).Should().BeFalse();

    [Fact]
    public void Parse_throws_on_invalid()
    {
        var act = () => ReferenceId.Parse("EXP-20-04-ABCD-1234");
        act.Should().Throw<FormatException>();
    }
}
