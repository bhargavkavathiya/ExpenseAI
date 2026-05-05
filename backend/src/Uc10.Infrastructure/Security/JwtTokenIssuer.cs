using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Uc10.Application.Abstractions;
using Uc10.Application.Options;
using Uc10.Domain.Abstractions;
using Uc10.Domain.Entities;

namespace Uc10.Infrastructure.Security;

public class JwtTokenIssuer : ITokenIssuer
{
    private readonly JwtOptions _opts;
    private readonly IClock _clock;

    public JwtTokenIssuer(IOptions<JwtOptions> opts, IClock clock)
    {
        _opts = opts.Value;
        _clock = clock;
    }

    public (string AccessToken, DateTimeOffset ExpiresAt) Issue(User user, IReadOnlyCollection<string> roles)
    {
        var now = _clock.UtcNow.UtcDateTime;
        var expires = now.AddMinutes(_opts.AccessTokenTtlMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.Iat,
                ((DateTimeOffset)now).ToUnixTimeSeconds().ToString(),
                ClaimValueTypes.Integer64),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };
        foreach (var r in roles) claims.Add(new Claim(ClaimTypes.Role, r));

        var keyBytes = Encoding.UTF8.GetBytes(_opts.Secret);
        if (keyBytes.Length < 32)
            throw new InvalidOperationException("Jwt:Secret must be at least 32 bytes for HS256");

        var creds = new SigningCredentials(new SymmetricSecurityKey(keyBytes), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: _opts.Issuer,
            audience: _opts.Audience,
            claims: claims,
            notBefore: now,
            expires: expires,
            signingCredentials: creds);

        var encoded = new JwtSecurityTokenHandler().WriteToken(token);
        return (encoded, new DateTimeOffset(expires, TimeSpan.Zero));
    }
}

public class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}

public class ReferenceIdGenerator : IReferenceIdGenerator
{
    private readonly IClock _clock;
    public ReferenceIdGenerator(IClock clock) => _clock = clock;

    private static readonly char[] Alphabet =
        "23456789ABCDEFGHJKLMNPQRSTUVWXYZ".ToCharArray(); // avoid O/0/I/1

    public string Generate()
    {
        var now = _clock.UtcNow;
        var r = Random.Shared;
        var a = new char[4];
        var b = new char[4];
        for (var i = 0; i < 4; i++) a[i] = Alphabet[r.Next(Alphabet.Length)];
        for (var i = 0; i < 4; i++) b[i] = Alphabet[r.Next(Alphabet.Length)];
        return $"EXP-{now.Year:D4}-{now.Month:D2}-{new string(a)}-{new string(b)}";
    }
}
