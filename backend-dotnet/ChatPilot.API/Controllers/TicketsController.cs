using System.Security.Claims;
using ChatPilot.API.DTOs;
using ChatPilot.API.Helpers;
using ChatPilot.API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPilot.API.Controllers;

[ApiController]
[Route("api/v1")]
[Authorize(Roles = "SuperAdmin,BusinessOwner,BusinessAdmin")]
public sealed class TicketsController : ControllerBase
{
    private readonly ITicketService _tickets;

    public TicketsController(ITicketService tickets) => _tickets = tickets;

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

    [HttpPost("tickets")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> Create([FromBody] CreateSupportTicketDto dto)
    {
        var id = await _tickets.CreateTicketAsync(GetBusinessId(), GetUserId(), dto, HttpContext.Connection.RemoteIpAddress?.ToString());
        return StatusCode(201, ApiResponse<object>.Ok(new { ticketId = id }, "Support ticket submitted."));
    }

    [HttpGet("tickets/{id:int}")]
    public async Task<IActionResult> GetThread(int id)
    {
        int? scopeBiz = User.IsInRole("SuperAdmin") ? null : GetBusinessId();
        var data = await _tickets.GetTicketAsync(id, scopeBiz);
        if (data is null) return NotFound(ApiResponse<object>.Fail("Support ticket not found."));
        return Ok(ApiResponse<object>.Ok(data));
    }
}
