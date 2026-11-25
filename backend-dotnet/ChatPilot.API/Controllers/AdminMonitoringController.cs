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
public sealed class AdminMonitoringController : ControllerBase
{
    private readonly IAnalyticsService _analytics;

    public AdminMonitoringController(IAnalyticsService analytics) => _analytics = analytics;

    private int GetAdminUserId()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(sub, out var id) ? id : 0;
    }

    [HttpGet("chatbots")]
    public async Task<IActionResult> ListChatbots(
        [FromQuery] string? search,
        [FromQuery] int? businessId,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 15)
    {
        var data = await _analytics.AdminListChatbotsAsync(search, businessId, status, page, pageSize);
        return Ok(ApiResponse<object>.Ok(data));
    }

    [HttpPatch("chatbots/{id:int}/status")]
    public async Task<IActionResult> SetChatbotStatus(int id, [FromBody] ToggleChatbotStatusDto dto)
    {
        await _analytics.AdminSetChatbotStatusAsync(
            id, GetAdminUserId(), dto.IsEnabled, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(ApiResponse<object>.Ok(new { chatbotId = id, isEnabled = dto.IsEnabled }));
    }

    [HttpGet("ai-usage")]
    public async Task<IActionResult> GetAiUsage([FromQuery] int days = 30)
    {
        var data = await _analytics.AdminGetAiUsageAsync(days);
        return Ok(ApiResponse<object>.Ok(data));
    }

    [HttpGet("conversations")]
    public async Task<IActionResult> ListConversations(
        [FromQuery] int? businessId,
        [FromQuery] string status = "all",
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 15)
    {
        var data = await _analytics.AdminListConversationsAsync(businessId, status, search, page, pageSize);
        return Ok(ApiResponse<object>.Ok(data));
    }
}
