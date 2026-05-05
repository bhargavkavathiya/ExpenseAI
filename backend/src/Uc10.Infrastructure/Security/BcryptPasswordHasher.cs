using Uc10.Application.Abstractions;

namespace Uc10.Infrastructure.Security;

public class BcryptPasswordHasher : IPasswordHasher
{
    // bcrypt silently truncates at 72 bytes; pre-truncate so oversize inputs
    // don't surprise users at verify time. Cost 10 is a sensible default for
    // hackathon demo hardware; bump for production.
    private const int WorkFactor = 10;

    public string Hash(string plainText)
    {
        var bytes = Truncate(plainText);
        return BCrypt.Net.BCrypt.HashPassword(System.Text.Encoding.UTF8.GetString(bytes), WorkFactor);
    }

    public bool Verify(string plainText, string hash)
    {
        try
        {
            var bytes = Truncate(plainText);
            return BCrypt.Net.BCrypt.Verify(System.Text.Encoding.UTF8.GetString(bytes), hash);
        }
        catch
        {
            return false;
        }
    }

    private static byte[] Truncate(string s)
    {
        var raw = System.Text.Encoding.UTF8.GetBytes(s);
        if (raw.Length <= 72) return raw;
        var t = new byte[72];
        Array.Copy(raw, t, 72);
        return t;
    }
}
