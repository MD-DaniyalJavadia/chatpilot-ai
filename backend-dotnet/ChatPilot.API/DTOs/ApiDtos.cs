using System.ComponentModel.DataAnnotations;

namespace ChatPilot.API.DTOs;

public sealed class RegisterRequestDto
{
    [Required, MaxLength(150)]
    public string FullName { get; set; } = string.Empty;

    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(8), MaxLength(128)]
    public string Password { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string BusinessName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Industry { get; set; }

    [MaxLength(500)]
    public string? WebsiteUrl { get; set; }
}

public sealed class LoginRequestDto
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}

public sealed class RefreshRequestDto
{
    [Required]
    public string RefreshToken { get; set; } = string.Empty;
}

public sealed class AuthResponseDto
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public int ExpiresInSeconds { get; set; }
    public UserSessionDto User { get; set; } = new();
}

public sealed class UserSessionDto
{
    public int UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public int? BusinessId { get; set; }
    public string? BusinessName { get; set; }
    public string? BusinessStatus { get; set; }
}

public sealed class UpdateBusinessStatusDto
{
    [Required]
    public string Status { get; set; } = string.Empty;
}

public sealed class UpdateBusinessProfileDto
{
    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Industry { get; set; }

    [MaxLength(500)]
    public string? WebsiteUrl { get; set; }

    [EmailAddress, MaxLength(256)]
    public string? SupportEmail { get; set; }

    [Required, MaxLength(64)]
    public string Timezone { get; set; } = "UTC";
}
