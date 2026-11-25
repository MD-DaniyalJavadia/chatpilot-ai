using System.ComponentModel.DataAnnotations;

namespace ChatPilot.API.DTOs;

public sealed class ResolveConversationRequestDto
{
    [Required]
    public bool IsResolved { get; set; }
}

public sealed class AnalyticsDailyPointDto
{
    public string Date { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public int Conversations { get; set; }
    public int Messages { get; set; }
    public long TokensUsed { get; set; }
}
