using System.Security.Claims;
using System.Text;
using ChatPilot.API.DTOs;
using ChatPilot.API.Helpers;
using ChatPilot.API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPilot.API.Controllers;

[ApiController]
[Route("api/v1/conversations")]
[Authorize(Roles = "BusinessOwner,BusinessAdmin,BusinessStaff")]
public sealed class ConversationsController : ControllerBase
{
    private readonly IAnalyticsService _analytics;

    public ConversationsController(IAnalyticsService analytics) => _analytics = analytics;

    private bool TryGetTenant(out int businessId, out int userId)
    {
        businessId = HttpContext.Items["TenantBusinessId"] is int bId ? bId : 0;
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(sub, out userId) && businessId > 0;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int? chatbotId,
        [FromQuery] string status = "all",
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 15)
    {
        if (!TryGetTenant(out var businessId, out _)) return Forbid();
        var data = await _analytics.ListConversationsAsync(businessId, chatbotId, status, search, page, pageSize);
        return Ok(ApiResponse<object>.Ok(data));
    }

    [HttpGet("export")]
    public async Task<IActionResult> ExportCsv([FromQuery] int? chatbotId, [FromQuery] string status = "all")
    {
        if (!TryGetTenant(out var businessId, out var userId)) return Forbid();
        var csv = await _analytics.ExportConversationsCsvAsync(
            businessId, userId, chatbotId, status, HttpContext.Connection.RemoteIpAddress?.ToString());
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv)).ToArray();
        return File(bytes, "text/csv; charset=utf-8", $"chatpilot-conversations-{DateTime.UtcNow:yyyy-MM-dd}.csv");
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetTranscript(int id)
    {
        if (!TryGetTenant(out var businessId, out _)) return Forbid();
        var data = await _analytics.GetConversationTranscriptAsync(id, businessId);
        return Ok(ApiResponse<object>.Ok(data));
    }

    [HttpPatch("{id:int}/resolve")]
    public async Task<IActionResult> SetResolved(int id, [FromBody] ResolveConversationRequestDto dto)
    {
        if (!TryGetTenant(out var businessId, out var userId)) return Forbid();
        await _analytics.SetConversationResolvedAsync(
            id, businessId, userId, dto.IsResolved, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(ApiResponse<object>.Ok(new { conversationId = id, isResolved = dto.IsResolved }));
    }
}
