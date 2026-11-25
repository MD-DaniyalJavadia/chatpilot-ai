using ChatPilot.API.DTOs;
using ChatPilot.API.Models;

namespace ChatPilot.API.Interfaces;

public interface IWidgetRepository
{
    Task<IEnumerable<AllowedDomainEntity>> ListAllowedDomainsAsync(int chatbotId, int businessId);
    Task<AllowedDomainEntity> AddAllowedDomainAsync(int chatbotId, int businessId, string normalizedDomain);
    Task<bool> DeleteAllowedDomainAsync(int allowedDomainId, int chatbotId, int businessId);
    Task UpdateWidgetAppearanceAsync(int chatbotId, int businessId, UpdateWidgetAppearanceRequestDto dto);
    Task<(PublicWidgetConfigRecord? Config, IReadOnlyList<string> AllowedDomains)> GetPublicConfigByPublicIdAsync(string publicId);
    Task<MonthlyQuotaStatusRecord> GetMonthlyQuotaAsync(int businessId);
    Task<int> GetOrCreateConversationAsync(int chatbotId, int businessId, string visitorSession, string? visitorDomain);
    Task<IEnumerable<WidgetMessageEntity>> ListMessagesBySessionAsync(int chatbotId, string visitorSession, int maxMessages = 30);
    Task InsertConversationTurnAsync(int conversationId, int businessId, int chatbotId, string userContent, string botContent, int tokensUsed, bool isUnanswered, string modelName);
}

public interface IWidgetService
{
    Task<IEnumerable<AllowedDomainEntity>> ListAllowedDomainsAsync(int chatbotId, int businessId);
    Task<AllowedDomainEntity> AddAllowedDomainAsync(int chatbotId, int businessId, int userId, string rawDomain, string? ipAddress);
    Task DeleteAllowedDomainAsync(int allowedDomainId, int chatbotId, int businessId, int userId, string? ipAddress);
    Task UpdateWidgetAppearanceAsync(int chatbotId, int businessId, int userId, UpdateWidgetAppearanceRequestDto dto, string? ipAddress);
    Task<(bool Allowed, string? CorsOrigin, string? VisitorDomain, string? BlockReason, PublicWidgetConfigRecord? Bot)> ValidateWidgetOriginAsync(
        string publicId, string? originHeader, string? refererHeader, string? requestHost);
    Task<PublicWidgetConfigResponseDto> GetPublicConfigAsync(PublicWidgetConfigRecord bot);
    Task<IEnumerable<WidgetMessageEntity>> GetVisitorHistoryAsync(PublicWidgetConfigRecord bot, string sessionId);
    Task<PublicWidgetChatResponseDto> ProcessVisitorChatAsync(
        PublicWidgetConfigRecord bot, string? visitorDomain, PublicWidgetChatRequestDto dto, CancellationToken ct = default);
}
