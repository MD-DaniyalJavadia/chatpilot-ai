using System.ComponentModel.DataAnnotations;

namespace ChatPilot.API.DTOs;

public sealed class AddAllowedDomainRequestDto
{
    [Required]
    [MaxLength(255)]
    public string Domain { get; set; } = string.Empty;
}

public sealed class UpdateWidgetAppearanceRequestDto
{
    [Required]
    [RegularExpression(@"^#[0-9a-fA-F]{6}$", ErrorMessage = "Brand color must be a valid 6-digit hex color.")]
    public string BrandColor { get; set; } = "#2563EB";

    [MaxLength(500)]
    public string? LogoUrl { get; set; }

    [EmailAddress]
    [MaxLength(256)]
    public string? HumanHandoverEmail { get; set; }

    [Required]
    [RegularExpression(@"^(bottom-right|bottom-left)$")]
    public string WidgetPosition { get; set; } = "bottom-right";

    [MaxLength(100)]
    public string? WidgetTitle { get; set; }

    [MaxLength(180)]
    public string? WidgetSubtitle { get; set; }

    [MaxLength(60)]
    public string? LauncherLabel { get; set; }

    public bool ShowCitations { get; set; } = true;
}

public sealed class PublicWidgetConfigResponseDto
{
    public string PublicId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string BusinessName { get; set; } = string.Empty;
    public string WidgetTitle { get; set; } = string.Empty;
    public string WidgetSubtitle { get; set; } = string.Empty;
    public string LauncherLabel { get; set; } = "Chat with us";
    public string WelcomeMessage { get; set; } = string.Empty;
    public string BrandColor { get; set; } = "#2563EB";
    public string? LogoUrl { get; set; }
    public string WidgetPosition { get; set; } = "bottom-right";
    public bool ShowCitations { get; set; } = true;
    public bool EnableConversationHistory { get; set; } = true;
    public bool EnableHumanHandover { get; set; }
    public string? HumanHandoverEmail { get; set; }
}

public sealed class PublicWidgetChatRequestDto
{
    [MaxLength(128)]
    public string? SessionId { get; set; }

    [Required]
    [MinLength(1)]
    [MaxLength(4000)]
    public string Message { get; set; } = string.Empty;
}

public sealed class PublicWidgetCitationDto
{
    public string SourceTitle { get; set; } = string.Empty;
    public string SourceType { get; set; } = string.Empty;
    public string? SourceUri { get; set; }
}

public sealed class PublicWidgetChatResponseDto
{
    public string SessionId { get; set; } = string.Empty;
    public int ConversationId { get; set; }
    public string Reply { get; set; } = string.Empty;
    public long ResponseTimeMs { get; set; }
    public IReadOnlyList<PublicWidgetCitationDto> Citations { get; set; } = Array.Empty<PublicWidgetCitationDto>();
    public bool HandoverOffered { get; set; }
    public string? HumanHandoverEmail { get; set; }
}
