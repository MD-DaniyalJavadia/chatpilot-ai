using System.Text;
using ChatPilot.API.DTOs;
using ChatPilot.API.Interfaces;

namespace ChatPilot.API.Services;

public sealed class AnalyticsService : IAnalyticsService
{
    private readonly IAnalyticsRepository _repo;
    private readonly IAuditLogRepository _auditLogs;

    public AnalyticsService(IAnalyticsRepository repo, IAuditLogRepository auditLogs)
    {
        _repo = repo;
        _auditLogs = auditLogs;
    }

    public async Task<object> ListConversationsAsync(
        int businessId, int? chatbotId, string status, string? search, int page, int pageSize)
    {
        var safeStatus = NormalizeStatus(status);
        var (items, total) = await _repo.ListConversationsByBusinessAsync(
            businessId, chatbotId, safeStatus, search?.Trim(), Math.Max(1, page), Math.Clamp(pageSize, 1, 50));

        return new { items, total, page = Math.Max(1, page), pageSize = Math.Clamp(pageSize, 1, 50) };
    }

    public async Task<object> GetConversationTranscriptAsync(int conversationId, int businessId)
    {
        var (conversation, messages) = await _repo.GetConversationTranscriptAsync(conversationId, businessId);
        if (conversation is null)
            throw new KeyNotFoundException("Conversation not found in your workspace.");

        return new { conversation, messages };
    }

    public async Task SetConversationResolvedAsync(
        int conversationId, int businessId, int userId, bool isResolved, string? ipAddress)
    {
        var updated = await _repo.SetConversationResolvedAsync(conversationId, businessId, isResolved);
        if (!updated)
            throw new KeyNotFoundException("Conversation not found in your workspace.");

        await _auditLogs.WriteAsync(
            userId,
            businessId,
            isResolved ? "ConversationResolved" : "ConversationReopened",
            "Conversation",
            conversationId.ToString(),
            $"Conversation #{conversationId} marked {(isResolved ? "Resolved" : "Open")}",
            ipAddress);
    }

    public async Task<string> ExportConversationsCsvAsync(
        int businessId, int userId, int? chatbotId, string status, string? ipAddress)
    {
        var safeStatus = NormalizeStatus(status);
        var rows = (await _repo.ExportConversationsByBusinessAsync(businessId, chatbotId, safeStatus)).ToList();

        var sb = new StringBuilder();
        sb.AppendLine("ConversationId,ChatbotName,VisitorSession,VisitorDomain,Status,MessageId,SenderType,Content,TokensUsed,IsUnanswered,MessageTimestamp");
        foreach (var r in rows)
        {
            sb.AppendLine(string.Join(",",
                EscapeCsv(r.ConversationId),
                EscapeCsv(r.ChatbotName),
                EscapeCsv(r.VisitorSession),
                EscapeCsv(r.VisitorDomain ?? string.Empty),
                EscapeCsv(r.IsResolved ? "Resolved" : "Open"),
                EscapeCsv(r.MessageId),
                EscapeCsv(r.SenderType),
                EscapeCsv(r.Content),
                EscapeCsv(r.TokensUsed),
                EscapeCsv(r.IsUnanswered ? "Yes" : "No"),
                EscapeCsv(r.MessageTimestamp.ToString("O"))));
        }

        await _auditLogs.WriteAsync(
            userId,
            businessId,
            "ConversationsExported",
            "Conversation",
            chatbotId?.ToString() ?? "all",
            $"Exported {rows.Count} message rows as CSV",
            ipAddress);

        return sb.ToString();
    }

    public async Task<object> GetBusinessAnalyticsAsync(int businessId, int? chatbotId, int days)
    {
        var safeDays = days is 7 or 14 or 30 or 90 ? days : 30;
        var (kpis, activity, tokens, bots, questions) = await _repo.GetBusinessAnalyticsAsync(businessId, chatbotId, safeDays);

        var activityMap = activity.ToDictionary(a => a.DayKey, a => a);
        var tokenMap = tokens.ToDictionary(t => t.DayKey, t => t.TokensUsed);

        var series = new List<AnalyticsDailyPointDto>();
        for (var i = safeDays - 1; i >= 0; i--)
        {
            var day = DateTime.UtcNow.Date.AddDays(-i).ToString("yyyy-MM-dd");
            activityMap.TryGetValue(day, out var act);
            tokenMap.TryGetValue(day, out var tok);
            series.Add(new AnalyticsDailyPointDto
            {
                Date = day,
                Label = day[5..],
                Conversations = act?.ConversationsCount ?? 0,
                Messages = act?.MessagesCount ?? 0,
                TokensUsed = tok
            });
        }

        var resolutionRate = kpis.TotalConversations > 0
            ? (int)Math.Round(kpis.ResolvedConversations * 100.0 / kpis.TotalConversations)
            : 0;

        return new
        {
            days = safeDays,
            kpis = new
            {
                kpis.TotalConversations,
                kpis.ResolvedConversations,
                kpis.TotalMessages,
                kpis.UnansweredMessages,
                kpis.TotalTokensUsed,
                resolutionRate
            },
            dailySeries = series,
            chatbotBreakdown = bots,
            popularQuestions = questions
        };
    }

    public async Task<object> GetBusinessUsageSummaryAsync(int businessId)
    {
        var (quotas, models) = await _repo.GetBusinessUsageSummaryAsync(businessId);
        return new
        {
            billingPeriod = DateTime.UtcNow.ToString("yyyy-MM"),
            quotas,
            modelBreakdown = models
        };
    }

    public async Task<object> AdminListChatbotsAsync(
        string? search, int? businessId, string? status, int page, int pageSize)
    {
        bool? isEnabled = status?.Trim().ToLowerInvariant() switch
        {
            "active" or "enabled" => true,
            "inactive" or "disabled" => false,
            _ => null
        };

        var (items, total) = await _repo.AdminListChatbotsAsync(
            search?.Trim(), businessId, isEnabled, Math.Max(1, page), Math.Clamp(pageSize, 1, 50));

        return new { items, total, page = Math.Max(1, page), pageSize = Math.Clamp(pageSize, 1, 50) };
    }

    public async Task AdminSetChatbotStatusAsync(int chatbotId, int adminUserId, bool isEnabled, string? ipAddress)
    {
        var updated = await _repo.AdminSetChatbotStatusAsync(chatbotId, isEnabled);
        if (!updated)
            throw new KeyNotFoundException("Chatbot not found.");

        await _auditLogs.WriteAsync(
            adminUserId,
            null,
            isEnabled ? "AdminChatbotEnabled" : "AdminChatbotDisabled",
            "Chatbot",
            chatbotId.ToString(),
            $"Super Admin toggled chatbot #{chatbotId} to {(isEnabled ? "Active" : "Inactive")}",
            ipAddress);
    }

    public async Task<object> AdminGetAiUsageAsync(int days)
    {
        var safeDays = days is 7 or 14 or 30 or 90 ? days : 30;
        var (daily, models, tenants) = await _repo.AdminGetAiUsageAsync(safeDays);
        return new { days = safeDays, dailySeries = daily, modelBreakdown = models, tenantLeaderboard = tenants };
    }

    public async Task<object> AdminListConversationsAsync(
        int? businessId, string status, string? search, int page, int pageSize)
    {
        var safeStatus = NormalizeStatus(status);
        var (items, total) = await _repo.AdminListConversationsAsync(
            businessId, safeStatus, search?.Trim(), Math.Max(1, page), Math.Clamp(pageSize, 1, 50));

        return new { items, total, page = Math.Max(1, page), pageSize = Math.Clamp(pageSize, 1, 50) };
    }

    private static string NormalizeStatus(string? status) =>
        (status ?? "all").Trim().ToLowerInvariant() switch
        {
            "resolved" => "resolved",
            "open" => "open",
            "unanswered" => "unanswered",
            _ => "all"
        };

    private static string EscapeCsv(object? value)
    {
        var raw = value?.ToString() ?? string.Empty;
        if (raw.Length > 0 && "=+-@\t\r".Contains(raw[0]))
            raw = "'" + raw;
        return $"\"{raw.Replace("\"", "\"\"")}\"";
    }
}
