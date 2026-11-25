using System.Data;
using ChatPilot.API.Interfaces;
using ChatPilot.API.Models;
using Dapper;

namespace ChatPilot.API.Repositories;

public sealed class AnalyticsRepository : IAnalyticsRepository
{
    private readonly SqlConnectionFactory _factory;
    public AnalyticsRepository(SqlConnectionFactory factory) => _factory = factory;

    public async Task<(IEnumerable<ConversationSummaryRecord> Items, int Total)> ListConversationsByBusinessAsync(
        int businessId, int? chatbotId, string status, string? search, int page, int pageSize)
    {
        using var conn = _factory.CreateConnection();
        using var multi = await conn.QueryMultipleAsync(
            "dbo.usp_Conversations_ListByBusiness",
            new { BusinessId = businessId, ChatbotId = chatbotId, Status = status, Search = search, Page = page, PageSize = pageSize },
            commandType: CommandType.StoredProcedure);

        var items = await multi.ReadAsync<ConversationSummaryRecord>();
        var total = await multi.ReadSingleAsync<int>();
        return (items, total);
    }

    public async Task<(ConversationDetailRecord? Conversation, IEnumerable<ConversationMessageRecord> Messages)> GetConversationTranscriptAsync(
        int conversationId, int businessId)
    {
        using var conn = _factory.CreateConnection();
        using var multi = await conn.QueryMultipleAsync(
            "dbo.usp_Conversations_GetTranscript",
            new { ConversationId = conversationId, BusinessId = businessId },
            commandType: CommandType.StoredProcedure);

        var conversation = await multi.ReadFirstOrDefaultAsync<ConversationDetailRecord>();
        var messages = await multi.ReadAsync<ConversationMessageRecord>();
        return (conversation, messages);
    }

    public async Task<bool> SetConversationResolvedAsync(int conversationId, int businessId, bool isResolved)
    {
        using var conn = _factory.CreateConnection();
        var affected = await conn.ExecuteScalarAsync<int>(
            "dbo.usp_Conversations_SetResolved",
            new { ConversationId = conversationId, BusinessId = businessId, IsResolved = isResolved },
            commandType: CommandType.StoredProcedure);
        return affected > 0;
    }

    public async Task<IEnumerable<ConversationExportRow>> ExportConversationsByBusinessAsync(
        int businessId, int? chatbotId, string status)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QueryAsync<ConversationExportRow>(
            "dbo.usp_Conversations_ExportByBusiness",
            new { BusinessId = businessId, ChatbotId = chatbotId, Status = status },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<(
        AnalyticsKpiRecord Kpis,
        IEnumerable<DailyActivityRow> DailyActivity,
        IEnumerable<DailyTokenRow> DailyTokens,
        IEnumerable<ChatbotAnalyticsRow> ChatbotBreakdown,
        IEnumerable<PopularQuestionRow> PopularQuestions
    )> GetBusinessAnalyticsAsync(int businessId, int? chatbotId, int days)
    {
        using var conn = _factory.CreateConnection();
        using var multi = await conn.QueryMultipleAsync(
            "dbo.usp_Analytics_BusinessOverview",
            new { BusinessId = businessId, ChatbotId = chatbotId, Days = days },
            commandType: CommandType.StoredProcedure);

        var kpis = await multi.ReadSingleAsync<AnalyticsKpiRecord>();
        var activity = await multi.ReadAsync<DailyActivityRow>();
        var tokens = await multi.ReadAsync<DailyTokenRow>();
        var bots = await multi.ReadAsync<ChatbotAnalyticsRow>();
        var questions = await multi.ReadAsync<PopularQuestionRow>();
        return (kpis, activity, tokens, bots, questions);
    }

    public async Task<(BusinessUsageQuotaRecord Quotas, IEnumerable<ModelUsageBreakdownRow> Models)> GetBusinessUsageSummaryAsync(
        int businessId)
    {
        using var conn = _factory.CreateConnection();
        using var multi = await conn.QueryMultipleAsync(
            "dbo.usp_Usage_BusinessSummary",
            new { BusinessId = businessId },
            commandType: CommandType.StoredProcedure);

        var quotas = await multi.ReadSingleAsync<BusinessUsageQuotaRecord>();
        var models = await multi.ReadAsync<ModelUsageBreakdownRow>();
        return (quotas, models);
    }

    public async Task<(IEnumerable<AdminChatbotRecord> Items, int Total)> AdminListChatbotsAsync(
        string? search, int? businessId, bool? isEnabled, int page, int pageSize)
    {
        using var conn = _factory.CreateConnection();
        using var multi = await conn.QueryMultipleAsync(
            "dbo.usp_Admin_ListChatbots",
            new { Search = search, BusinessId = businessId, IsEnabled = isEnabled, Page = page, PageSize = pageSize },
            commandType: CommandType.StoredProcedure);

        var items = await multi.ReadAsync<AdminChatbotRecord>();
        var total = await multi.ReadSingleAsync<int>();
        return (items, total);
    }

    public async Task<bool> AdminSetChatbotStatusAsync(int chatbotId, bool isEnabled)
    {
        using var conn = _factory.CreateConnection();
        var affected = await conn.ExecuteScalarAsync<int>(
            "dbo.usp_Admin_SetChatbotStatus",
            new { ChatbotId = chatbotId, IsEnabled = isEnabled },
            commandType: CommandType.StoredProcedure);
        return affected > 0;
    }

    public async Task<(
        IEnumerable<DailyTokenRow> DailyTokens,
        IEnumerable<ModelUsageBreakdownRow> Models,
        IEnumerable<AdminTenantUsageRow> Tenants
    )> AdminGetAiUsageAsync(int days)
    {
        using var conn = _factory.CreateConnection();
        using var multi = await conn.QueryMultipleAsync(
            "dbo.usp_Admin_AiUsageOverview",
            new { Days = days },
            commandType: CommandType.StoredProcedure);

        var daily = await multi.ReadAsync<DailyTokenRow>();
        var models = await multi.ReadAsync<ModelUsageBreakdownRow>();
        var tenants = await multi.ReadAsync<AdminTenantUsageRow>();
        return (daily, models, tenants);
    }

    public async Task<(IEnumerable<AdminConversationRow> Items, int Total)> AdminListConversationsAsync(
        int? businessId, string status, string? search, int page, int pageSize)
    {
        using var conn = _factory.CreateConnection();
        using var multi = await conn.QueryMultipleAsync(
            "dbo.usp_Admin_ListConversations",
            new { BusinessId = businessId, Status = status, Search = search, Page = page, PageSize = pageSize },
            commandType: CommandType.StoredProcedure);

        var items = await multi.ReadAsync<AdminConversationRow>();
        var total = await multi.ReadSingleAsync<int>();
        return (items, total);
    }
}
