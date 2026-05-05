using FluentAssertions;
using Uc10.Domain.ValueObjects;
using Xunit;

namespace Uc10.Tests;

public class ConfidenceScoreTests
{
    [Theory]
    [InlineData(0.0)]
    [InlineData(0.5)]
    [InlineData(1.0)]
    public void Accepts_values_in_range(double d)
    {
        var c = new ConfidenceScore((decimal)d);
        ((decimal)c).Should().BeInRange(0m, 1m);
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(1.01)]
    [InlineData(-999)]
    public void Rejects_out_of_range(double d)
    {
        var act = () => new ConfidenceScore((decimal)d);
        act.Should().Throw<ArgumentOutOfRangeException>();
    }

    [Fact]
    public void Rounds_to_four_decimal_places()
    {
        var c = new ConfidenceScore(0.123456m);
        c.Value.Should().Be(0.1235m);
    }
}
