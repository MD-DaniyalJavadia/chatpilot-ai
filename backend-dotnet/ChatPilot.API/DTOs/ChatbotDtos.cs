using System.ComponentModel.DataAnnotations;

namespace ChatPilot.API.DTOs;

public sealed class CreateChatbotRequestDto
{
    [Required, MinLength(2), MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [Required, MinLength(2), MaxLength(200)]
    public string BusinessName { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? WebsiteUrl { get; set; }

    [Required, MaxLength(50)]
    public string AiProvider { get; set; } = "GOOGLE_GEMINI";

    [Required, MaxLength(100)]
    public string AiModel { get; set; } = "gemini-4-hydrogen";

    [MaxLength(4000)]
    public string? SystemInstructions { get; set; }

    [MaxLength(500)]
    public string? WelcomeMessage { get; set; }

    [MaxLength(500)]
    public string? FallbackMessage { get; set; }

    [MaxLength(100)]
    public string? Personality { get; set; }

    [MaxLength(50)]
    public string ResponseLanguage { get; set; } = "English";

    [MaxLength(50)]
    public string ResponseTone { get; set; } = "Professional";
}

public sealed class UpdateChatbotConfigRequestDto
{
    [Required, MinLength(2), MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [Required, MinLength(2), MaxLength(200)]
    public string BusinessName { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? WebsiteUrl { get; set; }

    public bool IsEnabled { get; set; } = true;

    [Required, MaxLength(50)]
    public string AiProvider { get; set; } = "GOOGLE_GEMINI";

    [Required, MaxLength(100)]
    public string AiModel { get; set; } = "gemini-4-hydrogen";

    [MaxLength(4000)]
    public string? SystemInstructions { get; set; }

    [MaxLength(500)]
    public string? WelcomeMessage { get; set; }

    [MaxLength(500)]
    public string? FallbackMessage { get; set; }

    [MaxLength(100)]
    public string? Personality { get; set; }

    [Required, MaxLength(50)]
    public string ResponseLanguage { get; set; } = "English";

    [Required, MaxLength(50)]
    public string ResponseTone { get; set; } = "Professional";

    [Range(0.0, 2.0)]
    public decimal Temperature { get; set; } = 0.70m;

    [Range(128, 8192)]
    public int MaxOutputTokens { get; set; } = 2048;

    public bool EnableConversationHistory { get; set; } = true;
    public bool EnableHumanHandover { get; set; }
    public bool EnableFollowUpQuestions { get; set; } = true;
}

public sealed class ToggleChatbotStatusDto
{
    public bool IsEnabled { get; set; }
}

public sealed class PlaygroundTurnDto
{
    [Required]
    public string Role { get; set; } = "user";

    [Required]
    public string Content { get; set; } = string.Empty;
}

public sealed class PlaygroundChatRequestDto
{
    [Required, MinLength(1), MaxLength(4000)]
    public string Message { get; set; } = string.Empty;

    public List<PlaygroundTurnDto> History { get; set; } = new();

    public string? AiModel { get; set; }
    public string? SystemInstructions { get; set; }

    [Range(0.0, 2.0)]
    public decimal? Temperature { get; set; }

    [Range(128, 8192)]
    public int? MaxOutputTokens { get; set; }

    public bool UseRag { get; set; } = true;
}

public sealed class PlaygroundUsageDto
{
    public int PromptTokens { get; set; }
    public int OutputTokens { get; set; }
    public int TotalTokens { get; set; }
}

public sealed class PlaygroundChatResponseDto
{
    public string Reply { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public long ResponseTimeMs { get; set; }
    public PlaygroundUsageDto Usage { get; set; } = new();
    public PlaygroundRagDto? Rag { get; set; }
}
