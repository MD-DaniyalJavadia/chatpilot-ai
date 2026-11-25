namespace ChatPilot.API.Models;

public sealed class UserAuthRecord
{
    public int UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedOn { get; set; }
    public string RoleName { get; set; } = string.Empty;
    public int? BusinessId { get; set; }
    public string? BusinessName { get; set; }
    public string? BusinessStatus { get; set; }
}

public sealed class BusinessEntity
{
    public int BusinessId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Industry { get; set; }
    public string? WebsiteUrl { get; set; }
    public string? SupportEmail { get; set; }
    public string Timezone { get; set; } = "UTC";
    public string Status { get; set; } = "Active";
    public DateTime CreatedOn { get; set; }
    public DateTime UpdatedOn { get; set; }
}

public sealed class SuperAdminMetrics
{
    public int TotalUsers { get; set; }
    public int TotalBusinesses { get; set; }
    public int TotalActiveChatbots { get; set; }
    public int TotalConversations { get; set; }
    public int TotalMessages { get; set; }
    public long TotalAiTokensUsed { get; set; }
    public decimal MonthlyRevenueUsd { get; set; }
    public int ActiveSubscriptions { get; set; }
    public int ExpiredSubscriptions { get; set; }
}

public sealed class BusinessDashboardMetrics
{
    public int BusinessId { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    public string BusinessStatus { get; set; } = string.Empty;
    public string PlanName { get; set; } = "Free";
    public int MaxChatbots { get; set; }
    public int MaxMonthlyMessages { get; set; }
    public int MaxTeamMembers { get; set; }
    public int TeamMemberCount { get; set; }
    public int ChatbotCount { get; set; }
    public int ConversationCount { get; set; }
    public int MessageCount { get; set; }
    public long TokensUsed { get; set; }
}
