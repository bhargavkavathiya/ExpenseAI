using System.Text.Json;
using Microsoft.Extensions.Logging;
using Uc10.Application.Abstractions;
using Uc10.Domain.Entities;

namespace Uc10.Application.Admin;

public class EmployeeBandsService
{
    private readonly IEmployeeBandRepository _bands;
    private readonly ILogger<EmployeeBandsService> _log;

    public EmployeeBandsService(IEmployeeBandRepository bands, ILogger<EmployeeBandsService> log)
    {
        _bands = bands;
        _log = log;
    }

    // Defaults that the UI "Reset Defaults" button restores. Keep in sync with
    // database/init/09-seed-employee-bands.sql.
    private static readonly IReadOnlyDictionary<string, BandAllowances> Defaults = new Dictionary<string, BandAllowances>
    {
        ["L1"]  = new(DailyLimit: 3_000m,  MealsLimit: 800m,   HotelLimit: 2_500m,  FuelLimit: 1_200m, MgrReviewThreshold: 1_500m),
        ["L2"]  = new(DailyLimit: 5_000m,  MealsLimit: 1_200m, HotelLimit: 4_000m,  FuelLimit: 1_800m, MgrReviewThreshold: 2_500m),
        ["L3"]  = new(DailyLimit: 7_000m,  MealsLimit: 1_500m, HotelLimit: 5_000m,  FuelLimit: 2_500m, MgrReviewThreshold: 3_500m),
        ["M1"]  = new(DailyLimit: 10_000m, MealsLimit: 2_200m, HotelLimit: 7_000m,  FuelLimit: 3_500m, MgrReviewThreshold: 5_000m),
        ["M2"]  = new(DailyLimit: 15_000m, MealsLimit: 3_000m, HotelLimit: 10_000m, FuelLimit: 5_000m, MgrReviewThreshold: 7_000m),
        ["DIR"] = new(DailyLimit: 25_000m, MealsLimit: 5_000m, HotelLimit: 18_000m, FuelLimit: 6_000m, MgrReviewThreshold: 10_000m)
    };

    public async Task<IReadOnlyList<EmployeeBandWithAllowancesDto>> GetAllAsync(CancellationToken ct)
    {
        var rows = await _bands.GetActiveOrderedAsync(ct);
        return rows.Select(Map).ToList();
    }

    public async Task<IReadOnlyList<EmployeeBandWithAllowancesDto>> UpdateAllAsync(
        UpdateAllBandAllowancesRequest req, Guid updatedBy, CancellationToken ct)
    {
        foreach (var item in req.Bands)
        {
            var existing = await _bands.GetByCodeAsync(item.Code, ct)
                ?? throw new KeyNotFoundException($"band '{item.Code}' does not exist");
            existing.Allowances = SerializeAllowances(item.Allowances);
            existing.UpdatedBy = updatedBy;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
            await _bands.UpdateAsync(existing, ct);
        }
        _log.LogInformation("Band allowances updated for {N} bands by {User}", req.Bands.Count, updatedBy);
        return await GetAllAsync(ct);
    }

    public async Task<IReadOnlyList<EmployeeBandWithAllowancesDto>> ResetToDefaultsAsync(
        Guid updatedBy, CancellationToken ct)
    {
        foreach (var kv in Defaults)
        {
            var existing = await _bands.GetByCodeAsync(kv.Key, ct);
            if (existing is null) continue;          // band could have been deactivated; skip
            existing.Allowances = SerializeAllowances(kv.Value);
            existing.UpdatedBy = updatedBy;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
            await _bands.UpdateAsync(existing, ct);
        }
        _log.LogInformation("Band allowances reset to defaults by {User}", updatedBy);
        return await GetAllAsync(ct);
    }

    private static EmployeeBandWithAllowancesDto Map(EmployeeBand b) =>
        new(b.Code, b.Name, b.Description, b.RankOrder, b.Active, ParseAllowances(b.Allowances));

    private static BandAllowances ParseAllowances(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var r = doc.RootElement;
            return new BandAllowances(
                DailyLimit:         GetDecimal(r, "daily_limit"),
                MealsLimit:         GetDecimal(r, "meals_limit"),
                HotelLimit:         GetDecimal(r, "hotel_limit"),
                FuelLimit:          GetDecimal(r, "fuel_limit"),
                MgrReviewThreshold: GetDecimal(r, "mgr_review_threshold"));
        }
        catch
        {
            return new BandAllowances(0m, 0m, 0m, 0m, 0m);
        }
    }

    private static decimal GetDecimal(JsonElement r, string key) =>
        r.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0m;

    private static string SerializeAllowances(BandAllowances a) =>
        JsonSerializer.Serialize(new
        {
            daily_limit          = a.DailyLimit,
            meals_limit          = a.MealsLimit,
            hotel_limit          = a.HotelLimit,
            fuel_limit           = a.FuelLimit,
            mgr_review_threshold = a.MgrReviewThreshold
        });
}
