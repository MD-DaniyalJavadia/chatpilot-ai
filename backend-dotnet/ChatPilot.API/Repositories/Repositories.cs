using System.Data;
using ChatPilot.API.DTOs;
using ChatPilot.API.Interfaces;
using ChatPilot.API.Models;
using Dapper;
using Microsoft.Data.SqlClient;

namespace ChatPilot.API.Repositories;

public sealed class SqlConnectionFactory
{
    private readonly string _connectionString;
    public SqlConnectionFactory(IConfiguration configuration)
    {
        _connectionString = Environment.GetEnvironmentVariable("SQLSERVER_CONNECTION_STRING")
            ?? configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("SQL Server connection string is not configured.");
    }
    public IDbConnection CreateConnection() => new SqlConnection(_connectionString);
}

public sealed class UserRepository : IUserRepository
{
    private readonly SqlConnectionFactory _factory;
    public UserRepository(SqlConnectionFactory factory) => _factory = factory;

    public async Task<bool> IsSuperAdminClaimedAsync()
    {
        using var conn = _factory.CreateConnection();
        return await conn.ExecuteScalarAsync<bool>("dbo.usp_Auth_IsSuperAdminClaimed", commandType: CommandType.StoredProcedure);
    }

    public async Task<UserAuthRecord?> GetAuthByEmailAsync(string email)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<UserAuthRecord>(
            "dbo.usp_Users_GetAuthByEmail",
            new { Email = email },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<(int UserId, int BusinessId, string RoleName)> RegisterBusinessOwnerAsync(
        string fullName, string email, string passwordHash,
        string businessName, string slug, string? industry, string? websiteUrl)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QuerySingleAsync<(int UserId, int BusinessId, string RoleName)>(
            "dbo.usp_Auth_RegisterBusinessOwner",
            new { FullName = fullName, Email = email, PasswordHash = passwordHash, BusinessName = businessName, Slug = slug, Industry = industry, WebsiteUrl = websiteUrl },
            commandType: CommandType.StoredProcedure);
    }

    public async Task InsertRefreshTokenAsync(int userId, string tokenHash, DateTime expiresOn, string? ipAddress)
    {
        using var conn = _factory.CreateConnection();
        await conn.ExecuteAsync(
            "dbo.usp_RefreshTokens_Insert",
            new { UserId = userId, TokenHash = tokenHash, ExpiresOn = expiresOn, CreatedByIp = ipAddress },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<(bool IsValid, int? UserId)> RotateRefreshTokenAsync(string oldTokenHash, string newTokenHash, DateTime newExpiresOn, string? ipAddress)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QuerySingleAsync<(bool IsValid, int? UserId)>(
            "dbo.usp_RefreshTokens_Rotate",
            new { OldTokenHash = oldTokenHash, NewTokenHash = newTokenHash, NewExpiresOn = newExpiresOn, IpAddress = ipAddress },
            commandType: CommandType.StoredProcedure);
    }
}

public sealed class BusinessRepository : IBusinessRepository
{
    private readonly SqlConnectionFactory _factory;
    public BusinessRepository(SqlConnectionFactory factory) => _factory = factory;

    public async Task<IEnumerable<BusinessEntity>> ListAsync(string? search, string? status, int page, int pageSize)
    {
        using var conn = _factory.CreateConnection();
        const string sql = @"
            SELECT BusinessId, Name, Slug, Industry, WebsiteUrl, SupportEmail, Timezone, Status, CreatedOn, UpdatedOn
            FROM dbo.Businesses
            WHERE (@Status IS NULL OR Status = @Status)
              AND (@Search IS NULL OR Name LIKE '%' + @Search + '%' OR SupportEmail LIKE '%' + @Search + '%')
            ORDER BY CreatedOn DESC
            OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;";
        return await conn.QueryAsync<BusinessEntity>(sql, new { Search = search, Status = status, Page = page, PageSize = pageSize });
    }

    public async Task UpdateStatusAsync(int businessId, string status)
    {
        using var conn = _factory.CreateConnection();
        await conn.ExecuteAsync("dbo.usp_Businesses_UpdateStatus", new { BusinessId = businessId, Status = status }, commandType: CommandType.StoredProcedure);
    }

    public async Task UpdateProfileAsync(int businessId, UpdateBusinessProfileDto dto)
    {
        using var conn = _factory.CreateConnection();
        await conn.ExecuteAsync(
            "dbo.usp_Businesses_UpdateProfile",
            new { BusinessId = businessId, dto.Name, dto.Industry, dto.WebsiteUrl, dto.SupportEmail, dto.Timezone },
            commandType: CommandType.StoredProcedure);
    }
}

public sealed class DashboardRepository : IDashboardRepository
{
    private readonly SqlConnectionFactory _factory;
    public DashboardRepository(SqlConnectionFactory factory) => _factory = factory;

    public async Task<SuperAdminMetrics> GetSuperAdminMetricsAsync()
    {
        using var conn = _factory.CreateConnection();
        return await conn.QuerySingleAsync<SuperAdminMetrics>("dbo.usp_Dashboard_GetSuperAdminMetrics", commandType: CommandType.StoredProcedure);
    }

    public async Task<BusinessDashboardMetrics?> GetBusinessMetricsAsync(int businessId)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<BusinessDashboardMetrics>(
            "dbo.usp_Dashboard_GetBusinessMetrics",
            new { BusinessId = businessId },
            commandType: CommandType.StoredProcedure);
    }
}

public sealed class AuditLogRepository : IAuditLogRepository
{
    private readonly SqlConnectionFactory _factory;
    public AuditLogRepository(SqlConnectionFactory factory) => _factory = factory;

    public async Task InsertAsync(int? userId, int? businessId, string action, string entityType, string? entityId, string? details, string? ipAddress)
    {
        using var conn = _factory.CreateConnection();
        await conn.ExecuteAsync(
            "dbo.usp_AuditLogs_Insert",
            new { UserId = userId, BusinessId = businessId, Action = action, EntityType = entityType, EntityId = entityId, Details = details, IpAddress = ipAddress },
            commandType: CommandType.StoredProcedure);
    }
}
