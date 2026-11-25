using System.Security.Claims;
using ChatPilot.API.DTOs;
using ChatPilot.API.Helpers;
using ChatPilot.API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPilot.API.Controllers;

[ApiController]
[Route("api/v1/chatbots/{chatbotId:int}/sources")]
[Authorize(Roles = "BusinessOwner,BusinessAdmin,BusinessStaff")]
public sealed class KnowledgeController : ControllerBase
{
    private readonly IKnowledgeService _knowledge;

    public KnowledgeController(IKnowledgeService knowledge)
    {
        _knowledge = knowledge;
    }

    private (int UserId, int BusinessId) GetTenantContext()
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "0");
        var businessId = int.Parse(User.FindFirstValue("businessId") ?? "0");
        if (businessId <= 0) throw new UnauthorizedAccessException("No business workspace assigned.");
        return (userId, businessId);
    }

    [HttpGet]
    public async Task<IActionResult> List(
        int chatbotId,
        [FromQuery] string? search,
        [FromQuery] string? type,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var (_, businessId) = GetTenantContext();
        var result = await _knowledge.ListAsync(chatbotId, businessId, search, type, status, page, pageSize);
        return Ok(ApiResponse<object>.Ok(result));
    }

    [HttpGet("{sourceId:int}")]
    public async Task<IActionResult> GetById(int chatbotId, int sourceId)
    {
        var (_, businessId) = GetTenantContext();
        var result = await _knowledge.GetByIdAsync(sourceId, chatbotId, businessId);
        return Ok(ApiResponse<object>.Ok(result));
    }

    [HttpPost("upload")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadDocument(int chatbotId, [FromForm] IFormFile file, [FromForm] string? title)
    {
        if (file is null || file.Length == 0)
            return BadRequest(ApiResponse<object>.Fail("Please select a file to upload."));

        var (userId, businessId) = GetTenantContext();
        await using var stream = file.OpenReadStream();
        var created = await _knowledge.UploadDocumentAsync(
            chatbotId, businessId, userId, file.FileName, file.ContentType, stream, file.Length, title,
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return StatusCode(201, ApiResponse<object>.Ok(created, "Document uploaded and indexed."));
    }

    [HttpPost("website")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> IngestWebsite(int chatbotId, [FromBody] IngestWebsiteRequestDto dto)
    {
        var (userId, businessId) = GetTenantContext();
        var created = await _knowledge.IngestWebsiteAsync(
            chatbotId, businessId, userId, dto, HttpContext.Connection.RemoteIpAddress?.ToString());
        return StatusCode(201, ApiResponse<object>.Ok(created, "Website indexed into knowledge base."));
    }

    [HttpPost("faq")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> CreateFaq(int chatbotId, [FromBody] CreateFaqSourceRequestDto dto)
    {
        var (userId, businessId) = GetTenantContext();
        var created = await _knowledge.CreateFaqAsync(
            chatbotId, businessId, userId, dto, HttpContext.Connection.RemoteIpAddress?.ToString());
        return StatusCode(201, ApiResponse<object>.Ok(created, "FAQ added and indexed."));
    }

    [HttpPost("manual")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> CreateManual(int chatbotId, [FromBody] CreateManualSourceRequestDto dto)
    {
        var (userId, businessId) = GetTenantContext();
        var created = await _knowledge.CreateManualAsync(
            chatbotId, businessId, userId, dto, HttpContext.Connection.RemoteIpAddress?.ToString());
        return StatusCode(201, ApiResponse<object>.Ok(created, "Manual knowledge entry indexed."));
    }

    [HttpPut("{sourceId:int}")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> Update(int chatbotId, int sourceId, [FromBody] UpdateKnowledgeSourceRequestDto dto)
    {
        var (userId, businessId) = GetTenantContext();
        var updated = await _knowledge.UpdateContentAsync(
            sourceId, chatbotId, businessId, userId, dto, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(ApiResponse<object>.Ok(updated, "Knowledge entry updated and re-indexed."));
    }

    [HttpPost("{sourceId:int}/reindex")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> Reindex(int chatbotId, int sourceId, [FromBody] ReindexSourceRequestDto? dto)
    {
        var (userId, businessId) = GetTenantContext();
        var updated = await _knowledge.ReindexAsync(
            sourceId, chatbotId, businessId, userId, dto?.RefreshCrawl ?? false,
            HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(ApiResponse<object>.Ok(updated, "Knowledge source re-indexed."));
    }

    [HttpDelete("{sourceId:int}")]
    [Authorize(Roles = "BusinessOwner,BusinessAdmin")]
    public async Task<IActionResult> Delete(int chatbotId, int sourceId)
    {
        var (userId, businessId) = GetTenantContext();
        await _knowledge.DeleteAsync(sourceId, chatbotId, businessId, userId, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(ApiResponse<object>.Ok(new { sourceId }, "Knowledge source deleted."));
    }

    [HttpPost("search")]
    public async Task<IActionResult> Search(int chatbotId, [FromBody] RagSearchRequestDto dto)
    {
        var (_, businessId) = GetTenantContext();
        var matches = await _knowledge.SearchAsync(chatbotId, businessId, dto);
        return Ok(ApiResponse<object>.Ok(new { query = dto.Query, matches }));
    }
}
