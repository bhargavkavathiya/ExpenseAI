namespace Uc10.Domain.Entities;

public class Role
{
    public short Id { get; set; }
    public string Name { get; set; } = default!;
    public string Description { get; set; } = "";
}
