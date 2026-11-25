using ChatPilot.API.Models;

namespace ChatPilot.API.Interfaces;

public interface IAnalyticsRepository
{
    Task<(IEnumerable<ConversationSummaryRecord> Items, int Total)> ListConversationsByBusinessAsync(
        int businessId, int? chatbotId, string status, string? search, int page, int pageSize);
    Task<(ConversationDetailRecord? Conversation, IEnumerable<ConversationMessageRecord> Messages)> GetConversationTranscriptAsync(
        int conversationId, int businessId);
    Task<bool> SetConversationResolvedAsync(int conversationId, int businessId, bool isResolved);
    Task<IEnumerable<ConversationExportRow>> ExportConversationsByBusinessAsync(int businessId, int? chatbotId, string status);
    Task<(
        AnalyticsKpiRecord Kpis,
        IEnumerable<DailyActivityRow> DailyActivity,
        IEnumerable<DailyTokenRow> DailyTokens,
        IEnumerable<ChatbotAnalyticsRow> ChatbotBreakdown,
        IEnumerable<PopularQuestionRow> PopularQuestions
    )> GetBusinessAnalyticsAsync(int businessId, int? chatbotId, int days);
    Task<(BusinessUsageQuotaRecord Quotas, IEnumerable<ModelUsageBreakdownRow> Models)> GetBusinessUsageSummaryAsync(int businessId);
    Task<(IEnumerable<AdminChatbotRecord> Items, int Total)> AdminListChatbotsAsync(
        string? search, int? businessId, bool? isEnabled, int page, int pageSize);
    Task<bool> AdminSetChatbotStatusAsync(int chatbotId, bool isEnabled);
    Task<(
        IEnumerable<DailyTokenRow> DailyTokens,
        IEnumerable<ModelUsageBreakdownRow> Models,
        IEnumerable<AdminTenantUsageRow> Tenants
    )> AdminGetAiUsageAsync(int days);
    Task<(IEnumerable<AdminConversationRow> Items, int Total)> AdminListConversationsAsync(
        int? businessId, string status, string? search, int page, int pageSize);
}

public interface IAnalyticsService
{
    Task<object> ListConversationsAsync(int businessId, int? chatbotId, string status, string? search, int page, int pageSize);
    Task<object> GetConversationTranscriptAsync(int conversationId, int businessId);
    Task SetConversationResolvedAsync(int conversationId, int businessId, int userId, bool isResolved, string? ipAddress);
    Task<string> ExportConversationsCsvAsync(int businessId, int userId, int? chatbotId, string status, string? ipAddress);
    Task<object> GetBusinessAnalyticsAsync(int businessId, int? chatbotId, int days);
    Task<object> GetBusinessUsageSummaryAsync(int businessId);
    Task<object> AdminListChatbotsAsync(string? search, int? businessId, string? status, int page, int pageSize);
    Task AdminSetChatbotStatusAsync(int chatbotId, int adminUserId, bool isEnabled, string? ipAddress);
    Task<object> AdminGetAiUsageAsync(int days);
    Task<object> AdminListConversationsAsync(int? businessId, string status, string? search, int page, int pageSize);
}
