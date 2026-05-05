using Microsoft.Extensions.Options;
using Uc10.Application.Abstractions;
using Uc10.Application.Options;

namespace Uc10.Infrastructure.Storage;

public class LocalFileReceiptStorage : IReceiptStorage
{
    private readonly StorageOptions _opts;

    public LocalFileReceiptStorage(IOptions<StorageOptions> opts)
    {
        _opts = opts.Value;
        Directory.CreateDirectory(_opts.UploadsPath);
    }

    public async Task<StoredReceipt> SaveAsync(string refId, ReceiptUpload upload, CancellationToken ct)
    {
        var ext = GuessExtension(upload.ContentType);
        var path = Path.Combine(_opts.UploadsPath, $"{refId}{ext}");

        await using var src = upload.Content;
        await using var dst = File.Create(path);
        await src.CopyToAsync(dst, 81_920, ct);
        await dst.FlushAsync(ct);

        var info = new FileInfo(path);
        return new StoredReceipt(path, info.Length, upload.ContentType);
    }

    private static string GuessExtension(string contentType) => contentType.ToLowerInvariant() switch
    {
        "image/jpeg"      => ".jpg",
        "image/png"       => ".png",
        "image/webp"      => ".webp",
        "image/heic"      => ".heic",
        "image/heif"      => ".heif",
        "application/pdf" => ".pdf",
        _                 => ".bin"
    };
}
