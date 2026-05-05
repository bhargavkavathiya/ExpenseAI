namespace Uc10.Domain.Abstractions;

public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

public interface IReferenceIdGenerator
{
    // Generates EXP-YYYY-MM-XXXX-XXXX from the current clock.
    string Generate();
}
