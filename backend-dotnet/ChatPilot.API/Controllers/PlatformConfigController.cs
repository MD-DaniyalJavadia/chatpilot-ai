using System.Security.Claims;
using ChatPilot.API.DTOs;
using ChatPilot.API.Helpers;
using ChatPilot.API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPilot.API.Controllers;

[ApiController]
[Route("api/v1/admin")]
[Authorize(Roles = "SuperAdmin")]
public sealed class PlatformConfigController : ControllerBase
{
    private readonly ISettingsService _settings;

    public PlatformConfigController(ISettingsService settings) => _settings = settings;

    private int GetAdminUserId()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(sub, out var id) ? id : 0;
    }

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        var rows = await _settings.GetSystemSettingsAsync();
        return Ok(ApiResponse<object>.Ok(rows));
    }

    [HttpPut("ai-providers/{id:int}")]
    public async Task<IActionResult> UpdateAiProvider(int id, [FromBody] UpdateAiProviderDto dto)
    {
        var ok = await _settings.UpdateAiProviderAsync(
            id, dto, GetAdminUserId(), HttpContext.Connection.RemoteIpAddress?.ToString());
        if (!ok) return NotFound(ApiResponse<object>.Fail("AI provider not found."));
        return Ok(ApiResponse<object>.Ok(new { providerId = id }, "AI provider updated."));
    }
}
