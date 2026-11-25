namespace ChatPilot.API.Configuration;

public sealed class JwtSettings
{
    public string Issuer { get; set; } = "ChatPilot.API";
    public string Audience { get; set; } = "ChatPilot.Client";
    public string SigningKey { get; set; } = string.Empty;
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 7;
}
