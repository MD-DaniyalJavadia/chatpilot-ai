using ChatPilot.API.DTOs;
using ChatPilot.API.Helpers;
using ChatPilot.API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPilot.API.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/v1/widget/{publicId}")]
public sealed class WidgetController : ControllerBase
{
    private readonly IWidgetService _widgetService;

    public WidgetController(IWidgetService widgetService) => _widgetService = widgetService;

    private async Task<(bool Ok, IActionResult? Failure, Models.PublicWidgetConfigRecord? Bot, string? VisitorDomain)>
        AuthorizeOriginAndStatusAsync(string publicId)
    {
        var (allowed, corsOrigin, visitorDomain, blockReason, bot) =
            await _widgetService.ValidateWidgetOriginAsync(
                publicId,
                Request.Headers.Origin.ToString(),
                Request.Headers.Referer.ToString(),
                Request.Host.Value);

        if (!string.IsNullOrEmpty(corsOrigin))
        {
            Response.Headers["Access-Control-Allow-Origin"] = corsOrigin;
            Response.Headers["Vary"] = "Origin";
            Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
            Response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
        }

        if (bot is null)
            return (false, NotFound(ApiResponse<object>.Fail("Widget chatbot not found.")), null, null);

        if (!allowed)
            return (false, StatusCode(403, ApiResponse<object>.Fail(blockReason ?? "Domain not authorized.")), null, null);

        if (Request.Method == HttpMethods.Options)
            return (false, NoContent(), null, null);

        if (!string.Equals(bot.BusinessStatus, "Active", StringComparison.OrdinalIgnoreCase))
            return (false, StatusCode(403, ApiResponse<object>.Fail("This chatbot workspace is inactive.")), null, null);

        if (!bot.IsEnabled)
            return (false, StatusCode(403, ApiResponse<object>.Fail("This chatbot is currently paused.")), null, null);

        return (true, null, bot, visitorDomain);
    }

    [HttpOptions("config")]
    [HttpOptions("history")]
    [HttpOptions("chat")]
    public async Task<IActionResult> Preflight(string publicId)
    {
        var (_, failure, _, _) = await AuthorizeOriginAndStatusAsync(publicId);
        return failure ?? NoContent();
    }

    [HttpGet("config")]
    public async Task<IActionResult> GetConfig(string publicId)
    {
        var (ok, failure, bot, _) = await AuthorizeOriginAndStatusAsync(publicId);
        if (!ok || bot is null) return failure!;

        var config = await _widgetService.GetPublicConfigAsync(bot);
        return Ok(ApiResponse<PublicWidgetConfigResponseDto>.Ok(config));
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory(string publicId, [FromQuery] string sessionId)
    {
        var (ok, failure, bot, _) = await AuthorizeOriginAndStatusAsync(publicId);
        if (!ok || bot is null) return failure!;

        var messages = await _widgetService.GetVisitorHistoryAsync(bot, sessionId);
        return Ok(ApiResponse<object>.Ok(new { sessionId, messages }));
    }

    [HttpPost("chat")]
    public async Task<IActionResult> Chat(string publicId, [FromBody] PublicWidgetChatRequestDto dto, CancellationToken ct)
    {
        var (ok, failure, bot, visitorDomain) = await AuthorizeOriginAndStatusAsync(publicId);
        if (!ok || bot is null) return failure!;

        var response = await _widgetService.ProcessVisitorChatAsync(bot, visitorDomain, dto, ct);
        return Ok(ApiResponse<PublicWidgetChatResponseDto>.Ok(response));
    }
}
