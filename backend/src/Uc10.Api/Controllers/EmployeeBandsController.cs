using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Uc10.Application.Abstractions;

namespace Uc10.Api.Controllers;

public record EmployeeBandDto(
    string Code,
    string Name,
    string Description,
    int RankOrder,
    bool Active,
    object Allowances);

[ApiController]
[Route("api/employee-bands")]
public class EmployeeBandsController : ControllerBase
{
    private readonly IEmployeeBandRepository _bands;

    public EmployeeBandsController(IEmployeeBandRepository bands) => _bands = bands;

    // Public so the Register screen can fetch without being logged in.
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<EmployeeBandDto>), 200)]
    public async Task<IReadOnlyList<EmployeeBandDto>> List(CancellationToken ct)
    {
        var rows = await _bands.GetActiveOrderedAsync(ct);
        return rows.Select(b =>
        {
            object allowances = new { };
            try
            {
                using var doc = JsonDocument.Parse(b.Allowances);
                allowances = doc.RootElement.Clone();
            }
            catch { /* leave empty object */ }
            return new EmployeeBandDto(b.Code, b.Name, b.Description, b.RankOrder, b.Active, allowances);
        }).ToList();
    }
}
