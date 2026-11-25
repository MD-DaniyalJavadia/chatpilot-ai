using System.Security.Claims;
using ChatPilot.API.DTOs;
using ChatPilot.API.Helpers;
using ChatPilot.API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPilot.API.Controllers;

[ApiController]
[Route("api/v1/chatbots")]
[Authorize(Roles = "BusinessOwner,BusinessAdmin,BusinessStaff")]
public sealed class ChatbotsController : ControllerBase
{
    private readonly IChatbotService _chatbots;

    public ChatbotsController(IChatbotService chatbots) => _chatbots = chatbots;

    private bool TryGetTenant(out int businessId, out int userId)
    {
        businessId = HttpContext.Items["TenantBusinessId"] is int bId ? bId : 0;
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(sub, out userId) && businessId > 0;
    }

    [HttpGet("providers")]
    public async Task<IActionResult> ListProviders()
        => Ok(ApiResponse<object>.Ok(await _chatbots.ListProvidersAsync()));

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        if (!TryGetTenant(out var businessId, out _)) return Forbid();
        var (items, total) = await _chatbots.ListAsync(businessId, search, status, Math.Max(1, page), Math.Clamp(pageSize, 1, 50));
        return Ok(ApiResponse<object>.Ok(new { items, total, page, pageSize }));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        if (!TryGetTenant(out var businessId, out _)) return Forbid();
        return Ok(ApiResponse<object>.Ok(await _chatbots.GetByIdAsync(id, businessId)));
    }

    [HttpPost]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> Create([FromBody] CreateChatbotRequestDto dto)
    {
        if (!TryGetTenant(out var businessId, out var userId)) return Forbid();
        var created = await _chatbots.CreateAsync(businessId, userId, dto, HttpContext.Connection.RemoteIpAddress?.ToString());
        return CreatedAtAction(nameof(GetById), new { id = created.ChatbotId }, ApiResponse<object>.Ok(created, "Chatbot created."));
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> UpdateConfiguration(int id, [FromBody] UpdateChatbotConfigRequestDto dto)
    {
        if (!TryGetTenant(out var businessId, out var userId)) return Forbid();
        var updated = await _chatbots.UpdateConfigurationAsync(id, businessId, userId, dto, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(ApiResponse<object>.Ok(updated, "Chatbot configuration saved."));
    }

    [HttpPatch("{id:int}/status")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> SetStatus(int id, [FromBody] ToggleChatbotStatusDto dto)
    {
        if (!TryGetTenant(out var businessId, out var userId)) return Forbid();
        await _chatbots.SetEnabledAsync(id, businessId, userId, dto.IsEnabled, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(ApiResponse<object>.Ok(new { chatbotId = id, isEnabled = dto.IsEnabled }));
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> Delete(int id)
    {
        if (!TryGetTenant(out var businessId, out var userId)) return Forbid();
        await _chatbots.DeleteAsync(id, businessId, userId, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(ApiResponse<object>.Ok(new { chatbotId = id }, "Chatbot deleted."));
    }

    [HttpPost("{id:int}/playground")]
    public async Task<IActionResult> PlaygroundChat(int id, [FromBody] PlaygroundChatRequestDto dto)
    {
        if (!TryGetTenant(out var businessId, out _)) return Forbid();
        var result = await _chatbots.RunPlaygroundAsync(id, businessId, dto);
        return Ok(ApiResponse<PlaygroundChatResponseDto>.Ok(result));
    }
}
