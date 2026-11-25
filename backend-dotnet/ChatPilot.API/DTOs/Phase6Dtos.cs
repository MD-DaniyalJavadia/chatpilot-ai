using System.ComponentModel.DataAnnotations;

namespace ChatPilot.API.DTOs;

public sealed class CreatePlanRequestDto
{
    [Required, MaxLength(40)]
    public string Code { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [Range(0, 100000)]
    public decimal MonthlyPriceUsd { get; set; }

    [Range(0, 1000000)]
    public decimal YearlyPriceUsd { get; set; }

    [Range(1, 10000)]
    public int MaxChatbots { get; set; }

    [Range(1, 100000000)]
    public int MaxMonthlyMessages { get; set; }

    [Range(1, 10000)]
    public int MaxTeamMembers { get; set; }

    public bool AllowWebsiteIngestion { get; set; }
}

public sealed class UpdatePlanRequestDto
{
    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [Range(0, 100000)]
    public decimal MonthlyPriceUsd { get; set; }

    [Range(0, 1000000)]
    public decimal YearlyPriceUsd { get; set; }

    [Range(1, 10000)]
    public int MaxChatbots { get; set; }

    [Range(1, 100000000)]
    public int MaxMonthlyMessages { get; set; }

    [Range(1, 10000)]
    public int MaxTeamMembers { get; set; }

    public bool AllowWebsiteIngestion { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class TogglePlanStatusDto
{
    public bool IsActive { get; set; }
}

public sealed class CheckoutSubscriptionRequestDto
{
    [Range(1, int.MaxValue)]
    public int PlanId { get; set; }

    [Required]
    public string BillingCycle { get; set; } = "Monthly";

    [Required]
    public string Provider { get; set; } = "SandboxCard";
}

public sealed class AdminUpdateSubscriptionDto
{
    public int? PlanId { get; set; }
    public string? BillingCycle { get; set; }
    public string? Status { get; set; }
}

public sealed class AdminUpdatePaymentStatusDto
{
    [Required]
    public string Status { get; set; } = string.Empty;
}

public sealed class CreateSupportTicketDto
{
    [Required, MinLength(4), MaxLength(255)]
    public string Subject { get; set; } = string.Empty;

    [MaxLength(60)]
    public string Category { get; set; } = "General";

    [MaxLength(20)]
    public string Priority { get; set; } = "Normal";

    [Required, MinLength(10), MaxLength(4000)]
    public string Message { get; set; } = string.Empty;
}

public sealed class TicketReplyDto
{
    [Required, MinLength(2), MaxLength(4000)]
    public string Body { get; set; } = string.Empty;
}

public sealed class AdminUpdateTicketDto
{
    public string? Status { get; set; }
    public string? Priority { get; set; }
}

public sealed class UpdateSystemSettingsDto
{
    public bool AllowPublicRegistration { get; set; } = true;

    [Range(0, 90)]
    public int DefaultTrialDays { get; set; } = 14;

    [Range(5, 1000)]
    public int DefaultWidgetRateLimitPerMin { get; set; } = 60;

    [Range(7, 3650)]
    public int ConversationRetentionDays { get; set; } = 365;

    public bool MaintenanceMode { get; set; }

    [Required, EmailAddress, MaxLength(256)]
    public string SupportContactEmail { get; set; } = "support@chatpilot.local";
}

public sealed class AiProviderModelItemDto
{
    [Required]
    public string Id { get; set; } = string.Empty;

    [Required]
    public string Label { get; set; } = string.Empty;

    public string Tier { get; set; } = "standard";
}

public sealed class UpdateAiProviderDto
{
    [Required, MinLength(2), MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    public bool IsActive { get; set; }

    [Required, MinLength(1)]
    public List<AiProviderModelItemDto> Models { get; set; } = new();
}
