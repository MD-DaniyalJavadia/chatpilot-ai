using ChatPilot.API.DTOs;
using ChatPilot.API.Helpers;
using ChatPilot.API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPilot.API.Controllers;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly IAuthService _auth;
    public AuthController(IAuthService auth) => _auth = auth;

    [HttpGet("bootstrap-status")]
    [AllowAnonymous]
    public async Task<IActionResult> BootstrapStatus()
        => Ok(ApiResponse<object>.Ok(new { superAdminClaimed = await _auth.IsSuperAdminClaimedAsync() }));

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequestDto dto)
    {
        var result = await _auth.RegisterAsync(dto, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(ApiResponse<AuthResponseDto>.Ok(result, "Business workspace registered."));
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequestDto dto)
    {
        var result = await _auth.LoginAsync(dto, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(ApiResponse<AuthResponseDto>.Ok(result));
    }
}

[ApiController]
[Route("api/v1/dashboard")]
[Authorize]
public sealed class DashboardController : ControllerBase
{
    private readonly IDashboardRepository _dashboards;
    public DashboardController(IDashboardRepository dashboards) => _dashboards = dashboards;

    [HttpGet("super-admin")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<IActionResult> GetSuperAdmin()
        => Ok(ApiResponse<object>.Ok(await _dashboards.GetSuperAdminMetricsAsync()));

    [HttpGet("business")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin,BusinessStaff")]
    public async Task<IActionResult> GetBusiness()
    {
        if (HttpContext.Items["TenantBusinessId"] is not int businessId)
            return Forbid();

        var metrics = await _dashboards.GetBusinessMetricsAsync(businessId);
        return metrics is null ? NotFound() : Ok(ApiResponse<object>.Ok(metrics));
    }
}

[ApiController]
[Route("api/v1/businesses")]
[Authorize(Roles = "SuperAdmin")]
public sealed class BusinessesController : ControllerBase
{
    private readonly IBusinessRepository _businesses;
    public BusinessesController(IBusinessRepository businesses) => _businesses = businesses;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        => Ok(ApiResponse<object>.Ok(await _businesses.ListAsync(search, status, page, pageSize)));

    [HttpPatch("{id:int}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdateBusinessStatusDto dto)
    {
        await _businesses.UpdateStatusAsync(id, dto.Status);
        return Ok(ApiResponse<object>.Ok(new { businessId = id, status = dto.Status }));
    }
}
