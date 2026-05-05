using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using Microsoft.Extensions.Logging;
using Uc10.Application.Abstractions;
using PHashAlgo = CoenM.ImageHash.HashAlgorithms.PerceptualHash;

namespace Uc10.Infrastructure.Ai.PerceptualHash;

// Real perceptual hash using CoenM.ImageHash on SixLabors.ImageSharp bitmaps.
// Returns a 16-char hex string (64-bit pHash) for direct Hamming comparison
// against values in duplicate_hashes.phash. Robust to compression and resizing;
// a Hamming distance below the `duplicate_hamming` threshold (default 8)
// indicates a near-duplicate per FRS-3.5.
public class ImageSharpPerceptualHasher : IPerceptualHasher
{
    private readonly ILogger<ImageSharpPerceptualHasher> _log;

    public ImageSharpPerceptualHasher(ILogger<ImageSharpPerceptualHasher> log) => _log = log;

    public async Task<string> HashAsync(string storagePath, CancellationToken ct)
    {
        try
        {
            // Load off the thread pool so we don't block the Kestrel worker for large images.
            return await Task.Run(() =>
            {
                using var img = Image.Load<Rgba32>(storagePath);
                var hash = new PHashAlgo().Hash(img);
                return hash.ToString("x16"); // 16 hex chars, lowercase
            }, ct);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "pHash failed on {Path}; falling back to deterministic hash", storagePath);
            // On any decode failure, fall back to a stable hash so the pipeline still runs.
            // (e.g. unsupported HEIC on Linux). Fall-back value is not comparable to real
            // pHashes; it will never trigger a false duplicate because the Hamming distance
            // between a deterministic hex and any pHash is effectively random > 8.
            using var sha = System.Security.Cryptography.SHA256.Create();
            await using var fs = File.OpenRead(storagePath);
            var bytes = await sha.ComputeHashAsync(fs, ct);
            return Convert.ToHexString(bytes).ToLowerInvariant()[..16];
        }
    }
}
