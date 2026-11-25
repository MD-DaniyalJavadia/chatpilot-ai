namespace ChatPilot.API.Models;

public sealed class AIProviderEntity
{
    public int ProviderId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string SupportedModelsJson { get; set; } = "[]";
    public bool IsActive { get; set; }
}

public sealed class ChatbotListRecord
{
    public int ChatbotId { get; set; }
    public int BusinessId { get; set; }
    public string PublicId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    public string? WebsiteUrl { get; set; }
    public bool IsEnabled { get; set; }
    public DateTime CreatedOn { get; set; }
    public DateTime UpdatedOn { get; set; }
    public string AiProvider { get; set; } = "GOOGLE_GEMINI";
    public string AiModel { get; set; } = "gemini-4-hydrogen";
    public string ResponseLanguage { get; set; } = "English";
    public string ResponseTone { get; set; } = "Professional";
}

public sealed class ChatbotDetailRecord
{
    public int ChatbotId { get; set; }
    public int BusinessId { get; set; }
    public string PublicId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    public string? WebsiteUrl { get; set; }
    public bool IsEnabled { get; set; }
    public DateTime CreatedOn { get; set; }
    public DateTime UpdatedOn { get; set; }
    public string AiProvider { get; set; } = "GOOGLE_GEMINI";
    public string AiModel { get; set; } = "gemini-4-hydrogen";
    public string? SystemInstructions { get; set; }
    public string? WelcomeMessage { get; set; }
    public string? FallbackMessage { get; set; }
    public string? Personality { get; set; }
    public string ResponseLanguage { get; set; } = "English";
    public string ResponseTone { get; set; } = "Professional";
    public decimal Temperature { get; set; } = 0.70m;
    public int MaxOutputTokens { get; set; } = 2048;
    public string BrandColor { get; set; } = "#2563EB";
    public string? LogoUrl { get; set; }
    public string? HumanHandoverEmail { get; set; }
    public string WidgetPosition { get; set; } = "bottom-right";
    public string? WidgetTitle { get; set; }
    public string? WidgetSubtitle { get; set; }
    public string? LauncherLabel { get; set; }
    public bool ShowCitations { get; set; } = true;
    public bool EnableConversationHistory { get; set; } = true;
    public bool EnableHumanHandover { get; set; }
    public bool EnableFollowUpQuestions { get; set; } = true;
}
