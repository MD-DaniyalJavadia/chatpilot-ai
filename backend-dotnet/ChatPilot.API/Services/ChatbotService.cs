using System.Security.Cryptography;
using System.Text;
using ChatPilot.API.DTOs;
using ChatPilot.API.Interfaces;
using ChatPilot.API.Models;

namespace ChatPilot.API.Services;

public sealed class ChatbotService : IChatbotService
{
    private readonly IChatbotRepository _chatbots;
    private readonly IKnowledgeRepository _knowledge;
    private readonly IRagService _rag;
    private readonly IAuditLogRepository _audit;
    private readonly IGeminiService _gemini;

    public ChatbotService(
        IChatbotRepository chatbots,
        IKnowledgeRepository knowledge,
        IRagService rag,
        IAuditLogRepository audit,
        IGeminiService gemini)
    {
        _chatbots = chatbots;
        _knowledge = knowledge;
        _rag = rag;
        _audit = audit;
        _gemini = gemini;
    }

    public Task<IEnumerable<AIProviderEntity>> ListProvidersAsync() => _chatbots.ListProvidersAsync();

    public Task<(IEnumerable<ChatbotListRecord> Items, int Total)> ListAsync(
        int businessId, string? search, string? status, int page, int pageSize)
    {
        bool? isEnabled = status?.ToLowerInvariant() switch
        {
            "enabled" or "active" => true,
            "disabled" or "inactive" => false,
            _ => null
        };
        return _chatbots.ListByBusinessAsync(businessId, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), isEnabled, page, pageSize);
    }

    public async Task<ChatbotDetailRecord> GetByIdAsync(int chatbotId, int businessId)
    {
        return await _chatbots.GetByIdAsync(chatbotId, businessId)
            ?? throw new KeyNotFoundException("Chatbot not found in your business workspace.");
    }

    public async Task<ChatbotDetailRecord> CreateAsync(int businessId, int userId, CreateChatbotRequestDto dto, string? ipAddress)
    {
        ValidateWebsiteUrl(dto.WebsiteUrl);
        var publicId = $"cb_{Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant()}";
        var chatbotId = await _chatbots.CreateAsync(businessId, publicId, dto);

        await _audit.InsertAsync(userId, businessId, "ChatbotCreated", "Chatbot", chatbotId.ToString(), $"Created chatbot '{dto.Name}' ({dto.AiModel})", ipAddress);
        return await GetByIdAsync(chatbotId, businessId);
    }

    public async Task<ChatbotDetailRecord> UpdateConfigurationAsync(
        int chatbotId, int businessId, int userId, UpdateChatbotConfigRequestDto dto, string? ipAddress)
    {
        ValidateWebsiteUrl(dto.WebsiteUrl);
        await _chatbots.UpdateConfigurationAsync(chatbotId, businessId, dto);
        await _audit.InsertAsync(userId, businessId, "ChatbotConfigured", "Chatbot", chatbotId.ToString(), $"Updated configuration for '{dto.Name}'", ipAddress);
        return await GetByIdAsync(chatbotId, businessId);
    }

    public async Task SetEnabledAsync(int chatbotId, int businessId, int userId, bool isEnabled, string? ipAddress)
    {
        var updated = await _chatbots.SetEnabledAsync(chatbotId, businessId, isEnabled);
        if (!updated) throw new KeyNotFoundException("Chatbot not found in your business workspace.");

        await _audit.InsertAsync(userId, businessId, isEnabled ? "ChatbotActivated" : "ChatbotDeactivated", "Chatbot", chatbotId.ToString(), null, ipAddress);
    }

    public async Task DeleteAsync(int chatbotId, int businessId, int userId, string? ipAddress)
    {
        var deleted = await _chatbots.DeleteAsync(chatbotId, businessId);
        if (!deleted) throw new KeyNotFoundException("Chatbot not found in your business workspace.");

        await _audit.InsertAsync(userId, businessId, "ChatbotDeleted", "Chatbot", chatbotId.ToString(), "Deleted chatbot and settings", ipAddress);
    }

    public async Task<PlaygroundChatResponseDto> RunPlaygroundAsync(int chatbotId, int businessId, PlaygroundChatRequestDto dto)
    {
        var bot = await GetByIdAsync(chatbotId, businessId);

        var model = string.IsNullOrWhiteSpace(dto.AiModel) ? bot.AiModel : dto.AiModel.Trim();
        var baseInstructions = dto.SystemInstructions ?? bot.SystemInstructions ?? string.Empty;
        var temperature = dto.Temperature ?? bot.Temperature;
        var maxTokens = dto.MaxOutputTokens ?? bot.MaxOutputTokens;

        var stats = await _knowledge.GetStatsAsync(chatbotId, businessId);
        IReadOnlyList<RagCitationDto> citations = Array.Empty<RagCitationDto>();
        if (dto.UseRag && stats.TotalChunks > 0)
        {
            citations = await _rag.RetrieveAsync(chatbotId, businessId, dto.Message.Trim(), 5, 0.28);
        }

        var composedInstruction = BuildSystemInstruction(bot, baseInstructions, maxTokens, citations);
        var history = bot.EnableConversationHistory ? dto.History : new List<PlaygroundTurnDto>();

        var result = await _gemini.GenerateReplyAsync(model, composedInstruction, history, dto.Message.Trim(), temperature, maxTokens);
        await _chatbots.RecordUsageAsync(businessId, chatbotId, result.Usage.TotalTokens, 0, result.Model);

        result.Rag = new PlaygroundRagDto
        {
            Enabled = dto.UseRag,
            IndexedChunksAvailable = stats.TotalChunks,
            RetrievedCount = citations.Count,
            Citations = citations.ToList()
        };

        return result;
    }

    private static string BuildSystemInstruction(
        ChatbotDetailRecord bot, string customInstructions, int maxOutputTokens, IReadOnlyList<RagCitationDto> citations)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"You are {bot.Name}, an AI assistant representing {bot.BusinessName}.");
        if (!string.IsNullOrWhiteSpace(bot.Description))
            sb.AppendLine($"Assistant purpose: {bot.Description}");
        if (!string.IsNullOrWhiteSpace(bot.WebsiteUrl))
            sb.AppendLine($"Official website: {bot.WebsiteUrl}");
        sb.AppendLine($"Respond in {bot.ResponseLanguage} with a {bot.ResponseTone} tone.");
        if (!string.IsNullOrWhiteSpace(bot.Personality))
            sb.AppendLine($"Personality: {bot.Personality}.");
        if (!string.IsNullOrWhiteSpace(bot.FallbackMessage))
            sb.AppendLine($"If you do not know an answer, politely respond using: \"{bot.FallbackMessage}\".");
        if (bot.EnableFollowUpQuestions)
            sb.AppendLine("When helpful, conclude with one concise, relevant follow-up question.");
        sb.AppendLine($"Keep answers concise and well under {maxOutputTokens} tokens.");
        if (!string.IsNullOrWhiteSpace(customInstructions))
        {
            sb.AppendLine("Additional business instructions:");
            sb.AppendLine(customInstructions.Trim());
        }

        if (citations.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("--- BUSINESS KNOWLEDGE BASE CONTEXT (GROUNDED SOURCES) ---");
            sb.AppendLine("Prioritize these verified knowledge snippets over general assumptions and avoid fabricating unsupported facts.");
            for (var i = 0; i < citations.Count; i++)
            {
                var c = citations[i];
                sb.AppendLine($"[Source {i + 1}: {c.SourceTitle} ({c.SourceType})]");
                sb.AppendLine(c.Content ?? c.Snippet);
                sb.AppendLine();
            }
        }

        return sb.ToString();
    }

    private static void ValidateWebsiteUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed) ||
            (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException("Website URL must be a valid http:// or https:// address.");
        }
    }
}
