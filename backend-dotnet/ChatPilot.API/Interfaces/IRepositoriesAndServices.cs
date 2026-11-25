using ChatPilot.API.DTOs;
using ChatPilot.API.Models;

namespace ChatPilot.API.Interfaces;

public interface IUserRepository
{
    Task<bool> IsSuperAdminClaimedAsync();
    Task<UserAuthRecord?> GetAuthByEmailAsync(string email);
    Task<(int UserId, int BusinessId, string RoleName)> RegisterBusinessOwnerAsync(
        string fullName, string email, string passwordHash,
        string businessName, string slug, string? industry, string? websiteUrl);
    Task InsertRefreshTokenAsync(int userId, string tokenHash, DateTime expiresOn, string? ipAddress);
    Task<(bool IsValid, int? UserId)> RotateRefreshTokenAsync(string oldTokenHash, string newTokenHash, DateTime newExpiresOn, string? ipAddress);
}

public interface IBusinessRepository
{
    Task<IEnumerable<BusinessEntity>> ListAsync(string? search, string? status, int page, int pageSize);
    Task UpdateStatusAsync(int businessId, string status);
    Task UpdateProfileAsync(int businessId, UpdateBusinessProfileDto dto);
}

public interface IDashboardRepository
{
    Task<SuperAdminMetrics> GetSuperAdminMetricsAsync();
    Task<BusinessDashboardMetrics?> GetBusinessMetricsAsync(int businessId);
}

public interface IAuditLogRepository
{
    Task InsertAsync(int? userId, int? businessId, string action, string entityType, string? entityId, string? details, string? ipAddress);
}

public interface IJwtTokenService
{
    string GenerateAccessToken(UserAuthRecord user);
    (string RawToken, string TokenHash) GenerateRefreshToken();
    string HashToken(string rawToken);
}

public interface IAuthService
{
    Task<bool> IsSuperAdminClaimedAsync();
    Task<AuthResponseDto> RegisterAsync(RegisterRequestDto dto, string? ipAddress);
    Task<AuthResponseDto> LoginAsync(LoginRequestDto dto, string? ipAddress);
}
