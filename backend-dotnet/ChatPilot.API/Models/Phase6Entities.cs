namespace ChatPilot.API.Models;

public sealed class SubscriptionPlanEntity
{
    public int PlanId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal MonthlyPriceUsd { get; set; }
    public decimal YearlyPriceUsd { get; set; }
    public int MaxChatbots { get; set; }
    public int MaxMonthlyMessages { get; set; }
    public int MaxTeamMembers { get; set; }
    public bool AllowWebsiteIngestion { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedOn { get; set; }
    public DateTime UpdatedOn { get; set; }
}

public sealed class SubscriptionRecordEntity
{
    public int SubscriptionId { get; set; }
    public int BusinessId { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    public string BusinessStatus { get; set; } = string.Empty;
    public int PlanId { get; set; }
    public string PlanCode { get; set; } = string.Empty;
    public string PlanName { get; set; } = string.Empty;
    public string BillingCycle { get; set; } = "Monthly";
    public string Status { get; set; } = "Active";
    public DateTime StartsOn { get; set; }
    public DateTime? ExpiresOn { get; set; }
    public decimal MonthlyPriceUsd { get; set; }
    public decimal YearlyPriceUsd { get; set; }
}

public sealed class PaymentRecordEntity
{
    public int PaymentId { get; set; }
    public int BusinessId { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    public int SubscriptionId { get; set; }
    public string PlanName { get; set; } = string.Empty;
    public string BillingCycle { get; set; } = string.Empty;
    public decimal AmountUsd { get; set; }
    public string Currency { get; set; } = "USD";
    public string Provider { get; set; } = string.Empty;
    public string? ExternalTxnId { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime? PaidOn { get; set; }
    public DateTime CreatedOn { get; set; }
}

public sealed class SupportTicketEntity
{
    public int TicketId { get; set; }
    public int BusinessId { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    public int UserId { get; set; }
    public string CreatedByName { get; set; } = string.Empty;
    public string CreatedByEmail { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Category { get; set; } = "General";
    public string Status { get; set; } = "Open";
    public string Priority { get; set; } = "Normal";
    public DateTime? LastRepliedOn { get; set; }
    public DateTime CreatedOn { get; set; }
    public DateTime UpdatedOn { get; set; }
    public int MessageCount { get; set; }
}

public sealed class SupportTicketMessageEntity
{
    public int TicketMessageId { get; set; }
    public int TicketId { get; set; }
    public int? UserId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public string SenderRole { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public DateTime CreatedOn { get; set; }
}

public sealed class SystemSettingEntity
{
    public string SettingKey { get; set; } = string.Empty;
    public string SettingValue { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime UpdatedOn { get; set; }
}

public sealed class AiProviderRecordEntity
{
    public int ProviderId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string SupportedModelsJson { get; set; } = "[]";
    public bool IsActive { get; set; }
    public DateTime CreatedOn { get; set; }
    public DateTime UpdatedOn { get; set; }
}
