using System.Security.Claims;
using ChatPilot.API.DTOs;
using ChatPilot.API.Helpers;
using ChatPilot.API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPilot.API.Controllers;

[ApiController]
[Route("api/v1")]
[Authorize]
public sealed class BillingController : ControllerBase
{
    private readonly IBillingService _billing;

    public BillingController(IBillingService billing) => _billing = billing;

    private int GetUserId()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(sub, out var id) ? id : 0;
    }

    private int GetBusinessId()
    {
        var claim = User.FindFirstValue("businessId");
        return int.TryParse(claim, out var id) ? id : 0;
    }

    [HttpGet("plans")]
    public async Task<IActionResult> ListPlans([FromQuery] bool includeInactive = false)
    {
        var allowInactive = includeInactive && User.IsInRole("SuperAdmin");
        var items = await _billing.ListPlansAsync(allowInactive);
        return Ok(ApiResponse<object>.Ok(new { items }));
    }

    [HttpPost("plans")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<IActionResult> CreatePlan([FromBody] CreatePlanRequestDto dto)
    {
        var id = await _billing.CreatePlanAsync(dto, GetUserId(), HttpContext.Connection.RemoteIpAddress?.ToString());
        return StatusCode(201, ApiResponse<object>.Ok(new { planId = id }, "Plan created."));
    }

    [HttpPut("plans/{id:int}")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<IActionResult> UpdatePlan(int id, [FromBody] UpdatePlanRequestDto dto)
    {
        var ok = await _billing.UpdatePlanAsync(id, dto, GetUserId(), HttpContext.Connection.RemoteIpAddress?.ToString());
        if (!ok) return NotFound(ApiResponse<object>.Fail("Subscription plan not found."));
        return Ok(ApiResponse<object>.Ok(new { planId = id }, "Plan updated."));
    }

    [HttpGet("subscription")]
    [Authorize(Roles = "BusinessOwner")]
    public async Task<IActionResult> GetBusinessSubscription()
    {
        var data = await _billing.GetBusinessBillingAsync(GetBusinessId());
        return Ok(ApiResponse<object>.Ok(data));
    }

    [HttpPost("subscription/checkout")]
    [Authorize(Roles = "BusinessOwner")]
    public async Task<IActionResult> Checkout([FromBody] CheckoutSubscriptionRequestDto dto, CancellationToken ct)
    {
        var result = await _billing.CheckoutAsync(
            GetBusinessId(), GetUserId(), dto, HttpContext.Connection.RemoteIpAddress?.ToString(), ct);
        return StatusCode(201, ApiResponse<object>.Ok(result, "Subscription updated."));
    }

    [HttpGet("admin/subscriptions")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<IActionResult> AdminSubscriptions(
        [FromQuery] string? search, [FromQuery] string status = "all", [FromQuery] int page = 1, [FromQuery] int pageSize = 15)
    {
        var items = await _billing.AdminListSubscriptionsAsync(search, status, page, pageSize);
        return Ok(ApiResponse<object>.Ok(new { items, page, pageSize }));
    }

    [HttpGet("admin/payments")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<IActionResult> AdminPayments(
        [FromQuery] string? search, [FromQuery] string status = "all", [FromQuery] string provider = "all",
        [FromQuery] int page = 1, [FromQuery] int pageSize = 15)
    {
        var items = await _billing.AdminListPaymentsAsync(search, status, provider, page, pageSize);
        return Ok(ApiResponse<object>.Ok(new { items, page, pageSize }));
    }
}
