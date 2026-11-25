using ChatPilot.API.DTOs;
using ChatPilot.API.Models;

namespace ChatPilot.API.Interfaces;

public interface IChatbotRepository
{
    Task<IEnumerable<AIProviderEntity>> ListProvidersAsync();
    Task<(IEnumerable<ChatbotListRecord> Items, int Total)> ListByBusinessAsync(int businessId, string? search, bool? isEnabled, int page, int pageSize);
    Task<ChatbotDetailRecord?> GetByIdAsync(int chatbotId, int businessId);
    Task<int> CreateAsync(int businessId, string publicId, CreateChatbotRequestDto dto);
    Task UpdateConfigurationAsync(int chatbotId, int businessId, UpdateChatbotConfigRequestDto dto);
    Task<bool> SetEnabledAsync(int chatbotId, int businessId, bool isEnabled);
    Task<bool> DeleteAsync(int chatbotId, int businessId);
    Task RecordUsageAsync(int businessId, int chatbotId, int tokensUsed, int messageCount, string modelName);
}

public interface IChatbotService
{
    Task<IEnumerable<AIProviderEntity>> ListProvidersAsync();
    Task<(IEnumerable<ChatbotListRecord> Items, int Total)> ListAsync(int businessId, string? search, string? status, int page, int pageSize);
    Task<ChatbotDetailRecord> GetByIdAsync(int chatbotId, int businessId);
    Task<ChatbotDetailRecord> CreateAsync(int businessId, int userId, CreateChatbotRequestDto dto, string? ipAddress);
    Task<ChatbotDetailRecord> UpdateConfigurationAsync(int chatbotId, int businessId, int userId, UpdateChatbotConfigRequestDto dto, string? ipAddress);
    Task SetEnabledAsync(int chatbotId, int businessId, int userId, bool isEnabled, string? ipAddress);
    Task DeleteAsync(int chatbotId, int businessId, int userId, string? ipAddress);
    Task<PlaygroundChatResponseDto> RunPlaygroundAsync(int chatbotId, int businessId, PlaygroundChatRequestDto dto);
}

public interface IGeminiService
{
    Task<PlaygroundChatResponseDto> GenerateReplyAsync(
        string model,
        string systemInstruction,
        IReadOnlyList<PlaygroundTurnDto> history,
        string userMessage,
        decimal temperature,
        int maxOutputTokens,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<double[]>> GenerateEmbeddingsAsync(
        IReadOnlyList<string> texts,
        CancellationToken cancellationToken = default);
}
