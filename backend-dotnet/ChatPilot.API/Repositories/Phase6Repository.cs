using System.Data;
using ChatPilot.API.Configuration;
using ChatPilot.API.DTOs;
using ChatPilot.API.Interfaces;
using ChatPilot.API.Models;
using Dapper;

namespace ChatPilot.API.Repositories;

public sealed class Phase6Repository : IPhase6Repository
{
    private readonly SqlConnectionFactory _factory;

    public Phase6Repository(SqlConnectionFactory factory) => _factory = factory;

    public async Task<IEnumerable<SubscriptionPlanEntity>> ListPlansAsync(bool includeInactive)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QueryAsync<SubscriptionPlanEntity>(
            "dbo.usp_Plans_List",
            new { IncludeInactive = includeInactive },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<int> CreatePlanAsync(CreatePlanRequestDto dto)
    {
        using var conn = _factory.CreateConnection();
        return await conn.ExecuteScalarAsync<int>(
            "dbo.usp_Plans_Create",
            new
            {
                dto.Code,
                dto.Name,
                dto.Description,
                dto.MonthlyPriceUsd,
                dto.YearlyPriceUsd,
                dto.MaxChatbots,
                dto.MaxMonthlyMessages,
                dto.MaxTeamMembers,
                dto.AllowWebsiteIngestion
            },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<bool> UpdatePlanAsync(int planId, UpdatePlanRequestDto dto)
    {
        using var conn = _factory.CreateConnection();
        var rows = await conn.ExecuteScalarAsync<int>(
            "dbo.usp_Plans_Update",
            new
            {
                PlanId = planId,
                dto.Name,
                dto.Description,
                dto.MonthlyPriceUsd,
                dto.YearlyPriceUsd,
                dto.MaxChatbots,
                dto.MaxMonthlyMessages,
                dto.MaxTeamMembers,
                dto.AllowWebsiteIngestion,
                dto.IsActive
            },
            commandType: CommandType.StoredProcedure);
        return rows > 0;
    }

    public async Task<bool> SetPlanStatusAsync(int planId, bool isActive)
    {
        using var conn = _factory.CreateConnection();
        var rows = await conn.ExecuteAsync(
            "UPDATE dbo.SubscriptionPlans SET IsActive = @IsActive, UpdatedOn = SYSUTCDATETIME() WHERE PlanId = @PlanId",
            new { PlanId = planId, IsActive = isActive });
        return rows > 0;
    }

    public async Task<object> GetBusinessBillingSummaryAsync(int businessId)
    {
        using var conn = _factory.CreateConnection();
        using var grid = await conn.QueryMultipleAsync(
            "dbo.usp_Business_GetBillingSummary",
            new { BusinessId = businessId },
            commandType: CommandType.StoredProcedure);

        var current = await grid.ReadFirstOrDefaultAsync<dynamic>();
        var payments = (await grid.ReadAsync<PaymentRecordEntity>()).ToList();
        return new { currentSubscription = current, payments };
    }

    public async Task<int> SwitchSubscriptionPlanAsync(
        int businessId, int planId, string billingCycle, decimal amountUsd,
        string provider, string externalTxnId, string paymentStatus, DateTime expiresOn)
    {
        using var conn = _factory.CreateConnection();
        return await conn.ExecuteScalarAsync<int>(
            "dbo.usp_Business_SwitchSubscriptionPlan",
            new
            {
                BusinessId = businessId,
                PlanId = planId,
                BillingCycle = billingCycle,
                AmountUsd = amountUsd,
                Provider = provider,
                ExternalTxnId = externalTxnId,
                PaymentStatus = paymentStatus,
                ExpiresOn = expiresOn
            },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<IEnumerable<SubscriptionRecordEntity>> AdminListSubscriptionsAsync(string? search, string status, int page, int pageSize)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QueryAsync<SubscriptionRecordEntity>(
            "dbo.usp_Admin_ListSubscriptions",
            new { Search = search ?? string.Empty, Status = status, Page = page, PageSize = pageSize },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<IEnumerable<PaymentRecordEntity>> AdminListPaymentsAsync(string? search, string status, string provider, int page, int pageSize)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QueryAsync<PaymentRecordEntity>(
            "dbo.usp_Admin_ListPayments",
            new { Search = search ?? string.Empty, Status = status, Provider = provider, Page = page, PageSize = pageSize },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<int> CreateTicketAsync(int businessId, int userId, CreateSupportTicketDto dto)
    {
        using var conn = _factory.CreateConnection();
        return await conn.ExecuteScalarAsync<int>(
            "dbo.usp_Tickets_Create",
            new
            {
                BusinessId = businessId,
                UserId = userId,
                dto.Subject,
                dto.Category,
                dto.Priority,
                Body = dto.Message
            },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<object?> GetTicketWithMessagesAsync(int ticketId, int? tenantBusinessId)
    {
        using var conn = _factory.CreateConnection();
        var ticket = await conn.QueryFirstOrDefaultAsync<SupportTicketEntity>(
            @"SELECT t.TicketId, t.BusinessId, b.Name AS BusinessName, t.UserId,
                     u.FullName AS CreatedByName, u.Email AS CreatedByEmail,
                     t.Subject, t.Category, t.Status, t.Priority, t.LastRepliedOn, t.CreatedOn, t.UpdatedOn
              FROM dbo.SupportTickets t
              JOIN dbo.Businesses b ON b.BusinessId = t.BusinessId
              JOIN dbo.Users u ON u.UserId = t.UserId
              WHERE t.TicketId = @TicketId AND (@TenantBusinessId IS NULL OR t.BusinessId = @TenantBusinessId)",
            new { TicketId = ticketId, TenantBusinessId = tenantBusinessId });

        if (ticket is null) return null;

        var messages = (await conn.QueryAsync<SupportTicketMessageEntity>(
            @"SELECT m.TicketMessageId, m.TicketId, m.UserId,
                     ISNULL(u.FullName, 'System') AS SenderName, m.SenderRole, m.Body, m.CreatedOn
              FROM dbo.SupportTicketMessages m
              LEFT JOIN dbo.Users u ON u.UserId = m.UserId
              WHERE m.TicketId = @TicketId
              ORDER BY m.TicketMessageId ASC",
            new { TicketId = ticketId })).ToList();

        return new { ticket, messages };
    }

    public async Task<IEnumerable<SystemSettingEntity>> GetSystemSettingsAsync()
    {
        using var conn = _factory.CreateConnection();
        return await conn.QueryAsync<SystemSettingEntity>(
            "dbo.usp_SystemSettings_GetAll",
            commandType: CommandType.StoredProcedure);
    }

    public async Task<bool> UpdateAiProviderAsync(int providerId, string name, string modelsJson, bool isActive)
    {
        using var conn = _factory.CreateConnection();
        var rows = await conn.ExecuteScalarAsync<int>(
            "dbo.usp_Admin_UpdateAiProvider",
            new
            {
                ProviderId = providerId,
                Name = name,
                SupportedModelsJson = modelsJson,
                IsActive = isActive
            },
            commandType: CommandType.StoredProcedure);
        return rows > 0;
    }
}
