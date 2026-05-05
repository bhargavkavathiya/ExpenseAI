namespace Uc10.Domain.Enums;

public enum IntegrationHealth
{
    Unknown,
    Up,
    Degraded,
    Down
}

public enum CircuitState
{
    Closed,
    HalfOpen,
    Open
}

public static class RoleNames
{
    public const string Customer   = "customer";
    public const string Analyst    = "analyst";
    public const string Compliance = "compliance";
    public const string Admin      = "admin";
}

public static class AiModuleNames
{
    public const string Ocr         = "ocr";
    public const string Duplicate   = "duplicate";
    public const string Anomaly     = "anomaly";
    public const string Policy      = "policy";
    public const string Aggregator  = "aggregator";
    public const string Explanation = "explanation";
}
