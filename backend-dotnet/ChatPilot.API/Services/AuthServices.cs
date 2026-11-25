using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using ChatPilot.API.Configuration;
using ChatPilot.API.DTOs;
using ChatPilot.API.Helpers;
using ChatPilot.API.Interfaces;
using ChatPilot.API.Models;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace ChatPilot.API.Services;

public sealed class JwtTokenService : IJwtTokenService
{
    private readonly JwtSettings _settings;
    public JwtTokenService(IOptions<JwtSettings> options) => _settings = options.Value;

    public string GenerateAccessToken(UserAuthRecord user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_settings.SigningKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.UserId.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(ClaimTypes.Role, user.RoleName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        if (user.BusinessId.HasValue)
        {
            claims.Add(new Claim("businessId", user.BusinessId.Value.ToString()));
        }

        var token = new JwtSecurityToken(
            issuer: _settings.Issuer,
            audience: _settings.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_settings.AccessTokenMinutes),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public (string RawToken, string TokenHash) GenerateRefreshToken()
    {
        var raw = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        return (raw, HashToken(raw));
    }

    public string HashToken(string rawToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes);
    }
}

public sealed class AuthService : IAuthService
{
    private readonly IUserRepository _users;
    private readonly IAuditLogRepository _audit;
    private readonly IJwtTokenService _jwt;
    private readonly JwtSettings _settings;

    public AuthService(IUserRepository users, IAuditLogRepository audit, IJwtTokenService jwt, IOptions<JwtSettings> settings)
    {
        _users = users;
        _audit = audit;
        _jwt = jwt;
        _settings = settings.Value;
    }

    public Task<bool> IsSuperAdminClaimedAsync() => _users.IsSuperAdminClaimedAsync();

    public async Task<AuthResponseDto> RegisterAsync(RegisterRequestDto dto, string? ipAddress)
    {
        var slug = $"{dto.BusinessName.ToLowerInvariant().Replace(" ", "-")}-{RandomNumberGenerator.GetInt32(1000, 9999)}";
        var hash = PasswordHasher.Hash(dto.Password);
        var created = await _users.RegisterBusinessOwnerAsync(dto.FullName, dto.Email, hash, dto.BusinessName, slug, dto.Industry, dto.WebsiteUrl);
        var user = await _users.GetAuthByEmailAsync(dto.Email) ?? throw new InvalidOperationException("Registration failed.");
        await _audit.InsertAsync(created.UserId, created.BusinessId, "BusinessRegistered", "Business", created.BusinessId.ToString(), $"Registered {dto.BusinessName}", ipAddress);
        return await IssueSessionAsync(user, ipAddress);
    }

    public async Task<AuthResponseDto> LoginAsync(LoginRequestDto dto, string? ipAddress)
    {
        var user = await _users.GetAuthByEmailAsync(dto.Email);
        if (user is null || !PasswordHasher.Verify(dto.Password, user.PasswordHash))
        {
            throw new UnauthorizedAccessException("Invalid email or password.");
        }
        if (!user.IsActive)
        {
            throw new UnauthorizedAccessException("User account is deactivated.");
        }
        if (user.BusinessId.HasValue && user.BusinessStatus != "Active")
        {
            throw new UnauthorizedAccessException($"Business account is {user.BusinessStatus}.");
        }

        await _audit.InsertAsync(user.UserId, user.BusinessId, "UserLogin", "User", user.UserId.ToString(), "JWT login succeeded", ipAddress);
        return await IssueSessionAsync(user, ipAddress);
    }

    private async Task<AuthResponseDto> IssueSessionAsync(UserAuthRecord user, string? ipAddress)
    {
        var accessToken = _jwt.GenerateAccessToken(user);
        var (rawRefresh, refreshHash) = _jwt.GenerateRefreshToken();
        await _users.InsertRefreshTokenAsync(user.UserId, refreshHash, DateTime.UtcNow.AddDays(_settings.RefreshTokenDays), ipAddress);

        return new AuthResponseDto
        {
            AccessToken = accessToken,
            RefreshToken = rawRefresh,
            ExpiresInSeconds = _settings.AccessTokenMinutes * 60,
            User = new UserSessionDto
            {
                UserId = user.UserId,
                FullName = user.FullName,
                Email = user.Email,
                Role = user.RoleName,
                BusinessId = user.BusinessId,
                BusinessName = user.BusinessName,
                BusinessStatus = user.BusinessStatus
            }
        };
    }
}
