namespace ChatPilot.API.Models;

public sealed class ConversationSummaryRecord
{
    public int ConversationId { get; set; }
    public int ChatbotId { get; set; }
    public string ChatbotName { get; set; } = string.Empty;
    public string VisitorSession { get; set; } = string.Empty;
    public string? VisitorDomain { get; set; }
    public bool IsResolved { get; set; }
    public DateTime CreatedOn { get; set; }
    public DateTime UpdatedOn { get; set; }
    public int MessageCount { get; set; }
    public int UnansweredCount { get; set; }
    public int TokensUsed { get; set; }
    public string? FirstUserQuestion { get; set; }
}

public sealed class ConversationDetailRecord
{
    public int ConversationId { get; set; }
    public int ChatbotId { get; set; }
    public string ChatbotName { get; set; } = string.Empty;
    public int BusinessId { get; set; }
    public string? BusinessName { get; set; }
    public string VisitorSession { get; set; } = string.Empty;
    public string? VisitorDomain { get; set; }
    public bool IsResolved { get; set; }
    public DateTime CreatedOn { get; set; }
    public DateTime UpdatedOn { get; set; }
}

public sealed class ConversationMessageRecord
{
    public int MessageId { get; set; }
    public int ConversationId { get; set; }
    public string SenderType { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public int TokensUsed { get; set; }
    public bool IsUnanswered { get; set; }
    public DateTime CreatedOn { get; set; }
}

public sealed class ConversationExportRow
{
    public int ConversationId { get; set; }
    public string ChatbotName { get; set; } = string.Empty;
    public string VisitorSession { get; set; } = string.Empty;
    public string? VisitorDomain { get; set; }
    public bool IsResolved { get; set; }
    public int MessageId { get; set; }
    public string SenderType { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public int TokensUsed { get; set; }
    public bool IsUnanswered { get; set; }
    public DateTime MessageTimestamp { get; set; }
}

public sealed class AnalyticsKpiRecord
{
    public int TotalConversations { get; set; }
    public int ResolvedConversations { get; set; }
    public int TotalMessages { get; set; }
    public int UnansweredMessages { get; set; }
    public long TotalTokensUsed { get; set; }
}

public sealed class DailyActivityRow
{
    public string DayKey { get; set; } = string.Empty;
    public int ConversationsCount { get; set; }
    public int MessagesCount { get; set; }
}

public sealed class DailyTokenRow
{
    public string DayKey { get; set; } = string.Empty;
    public long TokensUsed { get; set; }
    public int MessagesCount { get; set; }
    public int ApiCallsCount { get; set; }
}

public sealed class ChatbotAnalyticsRow
{
    public int ChatbotId { get; set; }
    public string ChatbotName { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
    public int ConversationsCount { get; set; }
    public int MessagesCount { get; set; }
    public int UnansweredCount { get; set; }
    public long TokensUsed { get; set; }
}

public sealed class PopularQuestionRow
{
    public string QuestionText { get; set; } = string.Empty;
    public int AskCount { get; set; }
    public DateTime LastAskedOn { get; set; }
}

public sealed class BusinessUsageQuotaRecord
{
    public string PlanName { get; set; } = "Free";
    public int MaxChatbots { get; set; }
    public int MaxMonthlyMessages { get; set; }
    public int MaxTeamMembers { get; set; }
    public int ChatbotsUsed { get; set; }
    public int TeamMembersUsed { get; set; }
    public int MonthlyUserMessagesUsed { get; set; }
    public long MonthlyTokensUsed { get; set; }
    public int KnowledgeSourcesCount { get; set; }
    public int KnowledgeChunksCount { get; set; }
}

public sealed class ModelUsageBreakdownRow
{
    public string ModelName { get; set; } = string.Empty;
    public int RequestCount { get; set; }
    public int MessagesCount { get; set; }
    public long TokensUsed { get; set; }
}

public sealed class AdminChatbotRecord
{
    public int ChatbotId { get; set; }
    public int BusinessId { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    public string BusinessStatus { get; set; } = string.Empty;
    public string PublicId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
    public string AiModel { get; set; } = string.Empty;
    public DateTime CreatedOn { get; set; }
    public int ConversationCount { get; set; }
    public int IndexedSourcesCount { get; set; }
}

public sealed class AdminTenantUsageRow
{
    public int BusinessId { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    public string BusinessStatus { get; set; } = string.Empty;
    public string PlanName { get; set; } = string.Empty;
    public int MaxMonthlyMessages { get; set; }
    public long TokensUsed { get; set; }
    public int WidgetMessagesCount { get; set; }
}

public sealed class AdminConversationRow
{
    public int ConversationId { get; set; }
    public int BusinessId { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    public int ChatbotId { get; set; }
    public string ChatbotName { get; set; } = string.Empty;
    public string VisitorSession { get; set; } = string.Empty;
    public string? VisitorDomain { get; set; }
    public bool IsResolved { get; set; }
    public DateTime CreatedOn { get; set; }
    public DateTime UpdatedOn { get; set; }
    public int MessageCount { get; set; }
    public int UnansweredCount { get; set; }
}
