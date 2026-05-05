using Microsoft.EntityFrameworkCore;
using Uc10.Application.Abstractions;
using Uc10.Domain.Entities;

namespace Uc10.Infrastructure.Persistence;

public class DuplicateHashRepository : IDuplicateHashRepository
{
    private readonly Uc10DbContext _db;
    public DuplicateHashRepository(Uc10DbContext db) => _db = db;

    public async Task AppendAsync(Guid userId, Guid expenseId, string phash, CancellationToken ct)
    {
        _db.DuplicateHashes.Add(new DuplicateHash
        {
            Id         = Guid.NewGuid(),
            UserId     = userId,
            ExpenseId  = expenseId,
            PHash      = phash,
            CreatedAt  = DateTimeOffset.UtcNow
        });
        await _db.SaveChangesAsync(ct);
    }

    public async Task<int?> MinHammingDistanceAsync(Guid userId, string phash, int windowDays, CancellationToken ct)
    {
        var since = DateTimeOffset.UtcNow.AddDays(-windowDays);
        var prior = await _db.DuplicateHashes.AsNoTracking()
            .Where(h => h.UserId == userId && h.CreatedAt >= since)
            .Select(h => h.PHash)
            .ToListAsync(ct);
        if (prior.Count == 0) return null;

        var target = HexToUlong(phash);
        var min = int.MaxValue;
        foreach (var p in prior)
        {
            var d = PopCount(HexToUlong(p) ^ target);
            if (d < min) min = d;
        }
        return min;
    }

    private static ulong HexToUlong(string hex)
    {
        // 16-char hex → 64-bit. Missing/short inputs return 0.
        if (string.IsNullOrEmpty(hex) || hex.Length < 16) return 0UL;
        return ulong.Parse(hex.AsSpan(0, 16), System.Globalization.NumberStyles.HexNumber);
    }

    private static int PopCount(ulong x)
    {
        x = x - ((x >> 1) & 0x5555555555555555UL);
        x = (x & 0x3333333333333333UL) + ((x >> 2) & 0x3333333333333333UL);
        x = (x + (x >> 4)) & 0x0f0f0f0f0f0f0f0fUL;
        return (int)((x * 0x0101010101010101UL) >> 56);
    }
}
