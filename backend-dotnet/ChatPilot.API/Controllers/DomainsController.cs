using System.Security.Claims;
using ChatPilot.API.DTOs;
using ChatPilot.API.Helpers;
using ChatPilot.API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPilot.API.Controllers;

[ApiController]
[Route("api/v1/chatbots/{chatbotId:int}")]
[Authorize(Roles = "BusinessOwner,BusinessAdmin,BusinessStaff")]
public sealed class DomainsController : ControllerBase
{
    private readonly IWidgetService _widgetService;

    public DomainsController(IWidgetService widgetService) => _widgetService = widgetService;

    private bool TryGetTenant(out int businessId, out int userId)
    {
        businessId = HttpContext.Items["TenantBusinessId"] is int bId ? bId : 0;
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(sub, out userId) && businessId > 0;
    }

    [HttpGet("domains")]
    public async Task<IActionResult> ListDomains(int chatbotId)
    {
        if (!TryGetTenant(out var businessId, out _)) return Forbid();
        var items = await _widgetService.ListAllowedDomainsAsync(chatbotId, businessId);
        return Ok(ApiResponse<object>.Ok(new { items }));
    }

    [HttpPost("domains")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> AddDomain(int chatbotId, [FromBody] AddAllowedDomainRequestDto dto)
    {
        if (!TryGetTenant(out var businessId, out var userId)) return Forbid();
        var created = await _widgetService.AddAllowedDomainAsync(
            chatbotId, businessId, userId, dto.Domain, HttpContext.Connection.RemoteIpAddress?.ToString());
        return StatusCode(201, ApiResponse<object>.Ok(created, "Allowed domain added."));
    }

    [HttpDelete("domains/{domainId:int}")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> DeleteDomain(int chatbotId, int domainId)
    {
        if (!TryGetTenant(out var businessId, out var userId)) return Forbid();
        await _widgetService.DeleteAllowedDomainAsync(
            domainId, chatbotId, businessId, userId, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(ApiResponse<object>.Ok(new { domainId }, "Allowed domain removed."));
    }

    [HttpPut("widget-settings")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> UpdateWidgetAppearance(int chatbotId, [FromBody] UpdateWidgetAppearanceRequestDto dto)
    {
        if (!TryGetTenant(out var businessId, out var userId)) return Forbid();
        await _widgetService.UpdateWidgetAppearanceAsync(
            chatbotId, businessId, userId, dto, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(ApiResponse<object>.Ok(dto, "Widget appearance settings saved."));
    }
}
