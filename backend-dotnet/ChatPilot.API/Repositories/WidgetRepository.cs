using System.Data;
using ChatPilot.API.DTOs;
using ChatPilot.API.Interfaces;
using ChatPilot.API.Models;
using Dapper;

namespace ChatPilot.API.Repositories;

public sealed class WidgetRepository : IWidgetRepository
{
    private readonly SqlConnectionFactory _factory;
    public WidgetRepository(SqlConnectionFactory factory) => _factory = factory;

    public async Task<IEnumerable<AllowedDomainEntity>> ListAllowedDomainsAsync(int chatbotId, int businessId)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QueryAsync<AllowedDomainEntity>(
            "dbo.usp_AllowedDomains_ListByChatbot",
            new { ChatbotId = chatbotId, BusinessId = businessId },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<AllowedDomainEntity> AddAllowedDomainAsync(int chatbotId, int businessId, string normalizedDomain)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QuerySingleAsync<AllowedDomainEntity>(
            "dbo.usp_AllowedDomains_Add",
            new { ChatbotId = chatbotId, BusinessId = businessId, Domain = normalizedDomain },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<bool> DeleteAllowedDomainAsync(int allowedDomainId, int chatbotId, int businessId)
    {
        using var conn = _factory.CreateConnection();
        var affected = await conn.ExecuteScalarAsync<int>(
            "dbo.usp_AllowedDomains_Delete",
            new { AllowedDomainId = allowedDomainId, ChatbotId = chatbotId, BusinessId = businessId },
            commandType: CommandType.StoredProcedure);
        return affected > 0;
    }

    public async Task UpdateWidgetAppearanceAsync(int chatbotId, int businessId, UpdateWidgetAppearanceRequestDto dto)
    {
        using var conn = _factory.CreateConnection();
        await conn.ExecuteAsync(
            "dbo.usp_ChatbotSettings_UpdateWidgetAppearance",
            new
            {
                ChatbotId = chatbotId,
                BusinessId = businessId,
                dto.BrandColor,
                dto.LogoUrl,
                dto.HumanHandoverEmail,
                dto.WidgetPosition,
                dto.WidgetTitle,
                dto.WidgetSubtitle,
                dto.LauncherLabel,
                dto.ShowCitations
            },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<(PublicWidgetConfigRecord? Config, IReadOnlyList<string> AllowedDomains)> GetPublicConfigByPublicIdAsync(string publicId)
    {
        using var conn = _factory.CreateConnection();
        using var multi = await conn.QueryMultipleAsync(
            "dbo.usp_Widget_GetConfigByPublicId",
            new { PublicId = publicId },
            commandType: CommandType.StoredProcedure);

        var config = await multi.ReadFirstOrDefaultAsync<PublicWidgetConfigRecord>();
        var domains = (await multi.ReadAsync<string>()).ToList();
        return (config, domains);
    }

    public async Task<MonthlyQuotaStatusRecord> GetMonthlyQuotaAsync(int businessId)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QuerySingleAsync<MonthlyQuotaStatusRecord>(
            "dbo.usp_Widget_CheckMonthlyQuota",
            new { BusinessId = businessId },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<int> GetOrCreateConversationAsync(int chatbotId, int businessId, string visitorSession, string? visitorDomain)
    {
        using var conn = _factory.CreateConnection();
        return await conn.ExecuteScalarAsync<int>(
            "dbo.usp_Widget_GetOrCreateConversation",
            new { ChatbotId = chatbotId, BusinessId = businessId, VisitorSession = visitorSession, VisitorDomain = visitorDomain },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<IEnumerable<WidgetMessageEntity>> ListMessagesBySessionAsync(int chatbotId, string visitorSession, int maxMessages = 30)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QueryAsync<WidgetMessageEntity>(
            "dbo.usp_Widget_ListMessagesBySession",
            new { ChatbotId = chatbotId, VisitorSession = visitorSession, MaxMessages = maxMessages },
            commandType: CommandType.StoredProcedure);
    }

    public async Task InsertConversationTurnAsync(
        int conversationId, int businessId, int chatbotId,
        string userContent, string botContent, int tokensUsed, bool isUnanswered, string modelName)
    {
        using var conn = _factory.CreateConnection();
        await conn.ExecuteAsync(
            "dbo.usp_Widget_InsertConversationTurn",
            new
            {
                ConversationId = conversationId,
                BusinessId = businessId,
                ChatbotId = chatbotId,
                UserContent = userContent,
                BotContent = botContent,
                TokensUsed = tokensUsed,
                IsUnanswered = isUnanswered,
                ModelName = modelName
            },
            commandType: CommandType.StoredProcedure);
    }
}
