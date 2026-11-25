using ChatPilot.API.Helpers;
using ChatPilot.API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPilot.API.Controllers;

[ApiController]
[Route("api/v1")]
[Authorize(Roles = "BusinessOwner,BusinessAdmin")]
public sealed class AnalyticsController : ControllerBase
{
    private readonly IAnalyticsService _analytics;

    public AnalyticsController(IAnalyticsService analytics) => _analytics = analytics;

    private bool TryGetBusinessId(out int businessId)
    {
        businessId = HttpContext.Items["TenantBusinessId"] is int bId ? bId : 0;
        return businessId > 0;
    }

    [HttpGet("analytics/overview")]
    public async Task<IActionResult> GetOverview([FromQuery] int days = 30, [FromQuery] int? chatbotId = null)
    {
        if (!TryGetBusinessId(out var businessId)) return Forbid();
        var data = await _analytics.GetBusinessAnalyticsAsync(businessId, chatbotId, days);
        return Ok(ApiResponse<object>.Ok(data));
    }

    [HttpGet("usage/summary")]
    public async Task<IActionResult> GetUsageSummary()
    {
        if (!TryGetBusinessId(out var businessId)) return Forbid();
        var data = await _analytics.GetBusinessUsageSummaryAsync(businessId);
        return Ok(ApiResponse<object>.Ok(data));
    }
}
