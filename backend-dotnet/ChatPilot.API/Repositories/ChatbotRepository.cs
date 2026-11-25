using System.Data;
using ChatPilot.API.DTOs;
using ChatPilot.API.Interfaces;
using ChatPilot.API.Models;
using Dapper;

namespace ChatPilot.API.Repositories;

public sealed class ChatbotRepository : IChatbotRepository
{
    private readonly SqlConnectionFactory _factory;
    public ChatbotRepository(SqlConnectionFactory factory) => _factory = factory;

    public async Task<IEnumerable<AIProviderEntity>> ListProvidersAsync()
    {
        using var conn = _factory.CreateConnection();
        return await conn.QueryAsync<AIProviderEntity>("dbo.usp_AIProviders_ListActive", commandType: CommandType.StoredProcedure);
    }

    public async Task<(IEnumerable<ChatbotListRecord> Items, int Total)> ListByBusinessAsync(
        int businessId, string? search, bool? isEnabled, int page, int pageSize)
    {
        using var conn = _factory.CreateConnection();
        using var multi = await conn.QueryMultipleAsync(
            "dbo.usp_Chatbots_ListByBusiness",
            new { BusinessId = businessId, Search = search, IsEnabled = isEnabled, Page = page, PageSize = pageSize },
            commandType: CommandType.StoredProcedure);

        var items = await multi.ReadAsync<ChatbotListRecord>();
        var total = await multi.ReadSingleAsync<int>();
        return (items, total);
    }

    public async Task<ChatbotDetailRecord?> GetByIdAsync(int chatbotId, int businessId)
    {
        using var conn = _factory.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<ChatbotDetailRecord>(
            "dbo.usp_Chatbots_GetById",
            new { ChatbotId = chatbotId, BusinessId = businessId },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<int> CreateAsync(int businessId, string publicId, CreateChatbotRequestDto dto)
    {
        using var conn = _factory.CreateConnection();
        return await conn.ExecuteScalarAsync<int>(
            "dbo.usp_Chatbots_Create",
            new
            {
                BusinessId = businessId,
                PublicId = publicId,
                dto.Name,
                dto.Description,
                dto.BusinessName,
                dto.WebsiteUrl,
                dto.AiProvider,
                dto.AiModel,
                dto.SystemInstructions,
                dto.WelcomeMessage,
                dto.FallbackMessage,
                dto.Personality,
                dto.ResponseLanguage,
                dto.ResponseTone
            },
            commandType: CommandType.StoredProcedure);
    }

    public async Task UpdateConfigurationAsync(int chatbotId, int businessId, UpdateChatbotConfigRequestDto dto)
    {
        using var conn = _factory.CreateConnection();
        await conn.ExecuteAsync(
            "dbo.usp_Chatbots_UpdateConfiguration",
            new
            {
                ChatbotId = chatbotId,
                BusinessId = businessId,
                dto.Name,
                dto.Description,
                dto.BusinessName,
                dto.WebsiteUrl,
                dto.IsEnabled,
                dto.AiProvider,
                dto.AiModel,
                dto.SystemInstructions,
                dto.WelcomeMessage,
                dto.FallbackMessage,
                dto.Personality,
                dto.ResponseLanguage,
                dto.ResponseTone,
                dto.Temperature,
                dto.MaxOutputTokens,
                dto.EnableConversationHistory,
                dto.EnableHumanHandover,
                dto.EnableFollowUpQuestions
            },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<bool> SetEnabledAsync(int chatbotId, int businessId, bool isEnabled)
    {
        using var conn = _factory.CreateConnection();
        var affected = await conn.ExecuteScalarAsync<int>(
            "dbo.usp_Chatbots_SetEnabled",
            new { ChatbotId = chatbotId, BusinessId = businessId, IsEnabled = isEnabled },
            commandType: CommandType.StoredProcedure);
        return affected > 0;
    }

    public async Task<bool> DeleteAsync(int chatbotId, int businessId)
    {
        using var conn = _factory.CreateConnection();
        var affected = await conn.ExecuteScalarAsync<int>(
            "dbo.usp_Chatbots_Delete",
            new { ChatbotId = chatbotId, BusinessId = businessId },
            commandType: CommandType.StoredProcedure);
        return affected > 0;
    }

    public async Task RecordUsageAsync(int businessId, int chatbotId, int tokensUsed, int messageCount, string modelName)
    {
        using var conn = _factory.CreateConnection();
        await conn.ExecuteAsync(
            "dbo.usp_UsageLogs_Insert",
            new { BusinessId = businessId, ChatbotId = chatbotId, TokensUsed = tokensUsed, MessageCount = messageCount, ModelName = modelName },
            commandType: CommandType.StoredProcedure);
    }
}
