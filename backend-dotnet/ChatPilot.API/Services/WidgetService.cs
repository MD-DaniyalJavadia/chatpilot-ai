using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using ChatPilot.API.DTOs;
using ChatPilot.API.Interfaces;
using ChatPilot.API.Models;

namespace ChatPilot.API.Services;

public sealed class WidgetService : IWidgetService
{
    private static readonly Regex DomainPatternRegex = new(
        @"^(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*|localhost)(:[0-9]{1,5})?$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex SessionIdRegex = new(@"^[a-zA-Z0-9_-]{8,128}$", RegexOptions.Compiled);

    private readonly IWidgetRepository _widgets;
    private readonly IChatbotRepository _chatbots;
    private readonly IRagService _rag;
    private readonly IGeminiService _gemini;
    private readonly IAuditLogRepository _auditLogs;

    public WidgetService(
        IWidgetRepository widgets,
        IChatbotRepository chatbots,
        IRagService rag,
        IGeminiService gemini,
        IAuditLogRepository auditLogs)
    {
        _widgets = widgets;
        _chatbots = chatbots;
        _rag = rag;
        _gemini = gemini;
        _auditLogs = auditLogs;
    }

    public async Task<IEnumerable<AllowedDomainEntity>> ListAllowedDomainsAsync(int chatbotId, int businessId)
    {
        _ = await _chatbots.GetByIdAsync(chatbotId, businessId)
            ?? throw new KeyNotFoundException("Chatbot not found in your business workspace.");

        return await _widgets.ListAllowedDomainsAsync(chatbotId, businessId);
    }

    public async Task<AllowedDomainEntity> AddAllowedDomainAsync(
        int chatbotId, int businessId, int userId, string rawDomain, string? ipAddress)
    {
        var bot = await _chatbots.GetByIdAsync(chatbotId, businessId)
            ?? throw new KeyNotFoundException("Chatbot not found in your business workspace.");

        var normalized = NormalizeDomainPattern(rawDomain)
            ?? throw new ArgumentException("Enter a valid domain hostname (e.g., example.com, *.example.com, or localhost:5173).");

        var created = await _widgets.AddAllowedDomainAsync(chatbotId, businessId, normalized);
        await _auditLogs.WriteAsync(
            userId,
            businessId,
            "AllowedDomainAdded",
            "AllowedDomain",
            created.AllowedDomainId.ToString(),
            $"Added \"{normalized}\" for chatbot \"{bot.Name}\"",
            ipAddress);

        return created;
    }

    public async Task DeleteAllowedDomainAsync(
        int allowedDomainId, int chatbotId, int businessId, int userId, string? ipAddress)
    {
        _ = await _chatbots.GetByIdAsync(chatbotId, businessId)
            ?? throw new KeyNotFoundException("Chatbot not found in your business workspace.");

        var deleted = await _widgets.DeleteAllowedDomainAsync(allowedDomainId, chatbotId, businessId);
        if (!deleted)
            throw new KeyNotFoundException("Allowed domain not found for this chatbot.");

        await _auditLogs.WriteAsync(
            userId,
            businessId,
            "AllowedDomainRemoved",
            "AllowedDomain",
            allowedDomainId.ToString(),
            $"Removed allowed domain #{allowedDomainId} from chatbot #{chatbotId}",
            ipAddress);
    }

    public async Task UpdateWidgetAppearanceAsync(
        int chatbotId, int businessId, int userId, UpdateWidgetAppearanceRequestDto dto, string? ipAddress)
    {
        var bot = await _chatbots.GetByIdAsync(chatbotId, businessId)
            ?? throw new KeyNotFoundException("Chatbot not found in your business workspace.");

        if (!string.IsNullOrWhiteSpace(dto.LogoUrl) &&
            (!Uri.TryCreate(dto.LogoUrl.Trim(), UriKind.Absolute, out var uri) ||
             (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)))
        {
            throw new ArgumentException("Logo URL must start with http:// or https://.");
        }

        await _widgets.UpdateWidgetAppearanceAsync(chatbotId, businessId, dto);
        await _auditLogs.WriteAsync(
            userId,
            businessId,
            "WidgetAppearanceUpdated",
            "Chatbot",
            chatbotId.ToString(),
            $"Updated widget branding ({dto.BrandColor}, {dto.WidgetPosition}) for \"{bot.Name}\"",
            ipAddress);
    }

    public async Task<(bool Allowed, string? CorsOrigin, string? VisitorDomain, string? BlockReason, PublicWidgetConfigRecord? Bot)>
        ValidateWidgetOriginAsync(string publicId, string? originHeader, string? refererHeader, string? requestHost)
    {
        var (bot, allowedDomains) = await _widgets.GetPublicConfigByPublicIdAsync(publicId);
        if (bot is null)
            return (false, null, null, "Widget chatbot not found.", null);

        var originUri = ParseHttpUri(originHeader) ?? ParseHttpUri(refererHeader);
        var normalizedReqHost = (requestHost ?? string.Empty).Split(',')[0].Trim().ToLowerInvariant();
        var reqHostname = normalizedReqHost.Split(':')[0];

        if (originUri is null)
        {
            return (true, null, string.IsNullOrEmpty(reqHostname) ? "direct" : reqHostname, null, bot);
        }

        var originHostWithPort = originUri.IsDefaultPort
            ? originUri.Host.ToLowerInvariant()
            : $"{originUri.Host.ToLowerInvariant()}:{originUri.Port}";
        var originHostname = originUri.Host.ToLowerInvariant();
        var corsOrigin = !string.IsNullOrWhiteSpace(originHeader)
            ? $"{originUri.Scheme}://{originHostWithPort}"
            : null;

        if (!string.IsNullOrEmpty(normalizedReqHost) &&
            (originHostWithPort == normalizedReqHost || originHostname == reqHostname))
        {
            return (true, corsOrigin, originHostWithPort, null, bot);
        }

        var isMatched = allowedDomains.Any(pattern => MatchesDomain(originHostname, originHostWithPort, pattern));
        if (!isMatched)
        {
            return (
                false,
                null,
                originHostWithPort,
                $"Origin \"{originHostWithPort}\" is not authorized for this chatbot.",
                bot);
        }

        return (true, corsOrigin, originHostWithPort, null, bot);
    }

    public Task<PublicWidgetConfigResponseDto> GetPublicConfigAsync(PublicWidgetConfigRecord bot)
    {
        var dto = new PublicWidgetConfigResponseDto
        {
            PublicId = bot.PublicId,
            Name = bot.Name,
            BusinessName = bot.BusinessName,
            WidgetTitle = string.IsNullOrWhiteSpace(bot.WidgetTitle) ? bot.Name : bot.WidgetTitle,
            WidgetSubtitle = string.IsNullOrWhiteSpace(bot.WidgetSubtitle)
                ? (string.IsNullOrWhiteSpace(bot.BusinessName) ? "AI Support Assistant" : bot.BusinessName)
                : bot.WidgetSubtitle,
            LauncherLabel = string.IsNullOrWhiteSpace(bot.LauncherLabel) ? "Chat with us" : bot.LauncherLabel,
            WelcomeMessage = string.IsNullOrWhiteSpace(bot.WelcomeMessage)
                ? $"Hello! I am {bot.Name}, the AI assistant for {bot.BusinessName}. How can I help you today?"
                : bot.WelcomeMessage,
            BrandColor = Regex.IsMatch(bot.BrandColor ?? string.Empty, @"^#[0-9a-fA-F]{6}$") ? bot.BrandColor! : "#2563EB",
            LogoUrl = Uri.TryCreate(bot.LogoUrl, UriKind.Absolute, out var logoUri) &&
                      (logoUri.Scheme == Uri.UriSchemeHttp || logoUri.Scheme == Uri.UriSchemeHttps)
                ? logoUri.ToString()
                : null,
            WidgetPosition = bot.WidgetPosition == "bottom-left" ? "bottom-left" : "bottom-right",
            ShowCitations = bot.ShowCitations,
            EnableConversationHistory = bot.EnableConversationHistory,
            EnableHumanHandover = bot.EnableHumanHandover,
            HumanHandoverEmail = bot.EnableHumanHandover ? bot.HumanHandoverEmail : null
        };

        return Task.FromResult(dto);
    }

    public async Task<IEnumerable<WidgetMessageEntity>> GetVisitorHistoryAsync(PublicWidgetConfigRecord bot, string sessionId)
    {
        if (!SessionIdRegex.IsMatch(sessionId))
            throw new ArgumentException("Valid sessionId is required.");

        if (!bot.EnableConversationHistory)
            return Array.Empty<WidgetMessageEntity>();

        return await _widgets.ListMessagesBySessionAsync(bot.ChatbotId, sessionId, 30);
    }

    public async Task<PublicWidgetChatResponseDto> ProcessVisitorChatAsync(
        PublicWidgetConfigRecord bot, string? visitorDomain, PublicWidgetChatRequestDto dto, CancellationToken ct = default)
    {
        var message = (dto.Message ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(message) || message.Length > 4000)
            throw new ArgumentException("Message must be between 1 and 4000 characters.");

        var sessionId = !string.IsNullOrWhiteSpace(dto.SessionId) && SessionIdRegex.IsMatch(dto.SessionId.Trim())
            ? dto.SessionId.Trim()
            : $"vis_{Convert.ToHexString(RandomNumberGenerator.GetBytes(12)).ToLowerInvariant()}";

        var quota = await _widgets.GetMonthlyQuotaAsync(bot.BusinessId);
        if (quota.UsedThisMonth >= quota.MaxMonthlyMessages)
            throw new InvalidOperationException("Monthly message quota reached for this business subscription.");

        var historyTurns = new List<PlaygroundTurnDto>();
        if (bot.EnableConversationHistory)
        {
            var prior = await _widgets.ListMessagesBySessionAsync(bot.ChatbotId, sessionId, 12);
            foreach (var m in prior)
            {
                historyTurns.Add(new PlaygroundTurnDto
                {
                    Role = m.SenderType == "Assistant" ? "model" : "user",
                    Content = m.Content.Length > 4000 ? m.Content[..4000] : m.Content
                });
            }
        }

        var chunks = await _rag.RetrieveAsync(bot.ChatbotId, bot.BusinessId, message, 5, 0.28, ct);
        var instruction = BuildSystemInstruction(bot, chunks);

        var aiResult = await _gemini.GenerateReplyAsync(
            bot.AiModel,
            instruction,
            historyTurns,
            message,
            bot.Temperature,
            bot.MaxOutputTokens,
            ct);

        var isUnanswered = IsUnansweredReply(aiResult.Reply, bot.FallbackMessage);
        var conversationId = await _widgets.GetOrCreateConversationAsync(bot.ChatbotId, bot.BusinessId, sessionId, visitorDomain);

        await _widgets.InsertConversationTurnAsync(
            conversationId,
            bot.BusinessId,
            bot.ChatbotId,
            message,
            aiResult.Reply,
            aiResult.Usage.TotalTokens,
            isUnanswered,
            aiResult.Model);

        var citations = bot.ShowCitations
            ? chunks.Select(c => new PublicWidgetCitationDto
            {
                SourceTitle = c.SourceTitle,
                SourceType = c.SourceType,
                SourceUri = c.SourceUri
            }).ToList()
            : new List<PublicWidgetCitationDto>();

        var handoverOffered = bot.EnableHumanHandover &&
                              !string.IsNullOrWhiteSpace(bot.HumanHandoverEmail) &&
                              (isUnanswered || Regex.IsMatch(message, @"\b(human|agent|support|representative|person)\b", RegexOptions.IgnoreCase));

        return new PublicWidgetChatResponseDto
        {
            SessionId = sessionId,
            ConversationId = conversationId,
            Reply = aiResult.Reply,
            ResponseTimeMs = aiResult.ResponseTimeMs,
            Citations = citations,
            HandoverOffered = handoverOffered,
            HumanHandoverEmail = handoverOffered ? bot.HumanHandoverEmail : null
        };
    }

    private static string? NormalizeDomainPattern(string rawInput)
    {
        if (string.IsNullOrWhiteSpace(rawInput)) return null;
        var candidate = rawInput.Trim().ToLowerInvariant();
        if (candidate.Length > 255 || Regex.IsMatch(candidate, @"[\s?#\\]")) return null;

        if (candidate.Contains("://", StringComparison.Ordinal))
        {
            if (!Uri.TryCreate(candidate, UriKind.Absolute, out var uri) ||
                (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
                !string.IsNullOrEmpty(uri.UserInfo))
            {
                return null;
            }
            candidate = uri.IsDefaultPort ? uri.Host.ToLowerInvariant() : $"{uri.Host.ToLowerInvariant()}:{uri.Port}";
        }
        else
        {
            candidate = candidate.Split('/')[0];
        }

        if (string.IsNullOrEmpty(candidate) || candidate == "*" || candidate.StartsWith("*.localhost", StringComparison.Ordinal))
            return null;

        if (candidate.StartsWith("*.", StringComparison.Ordinal) && !candidate[2..].Split(':')[0].Contains('.'))
            return null;

        if (!DomainPatternRegex.IsMatch(candidate)) return null;

        var portSep = candidate.LastIndexOf(':');
        if (portSep > 0 && int.TryParse(candidate[(portSep + 1)..], out var port) && (port < 1 || port > 65535))
            return null;

        return candidate;
    }

    private static Uri? ParseHttpUri(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri)) return null;
        return (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps) ? uri : null;
    }

    private static bool MatchesDomain(string originHostname, string originHostWithPort, string pattern)
    {
        var normalized = pattern.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(normalized)) return false;

        if (normalized.StartsWith("*.", StringComparison.Ordinal))
        {
            var parts = normalized[2..].Split(':');
            var baseHost = parts[0];
            if (parts.Length > 1)
            {
                var originPort = originHostWithPort.Contains(':') ? originHostWithPort.Split(':')[1] : string.Empty;
                if (originPort != parts[1]) return false;
            }
            return originHostname == baseHost || originHostname.EndsWith($".{baseHost}", StringComparison.Ordinal);
        }

        return normalized.Contains(':')
            ? originHostWithPort == normalized
            : originHostname == normalized || originHostWithPort == normalized;
    }

    private static string BuildSystemInstruction(PublicWidgetConfigRecord bot, IReadOnlyList<RagCitationDto> chunks)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"You are {bot.Name}, an AI assistant representing {(string.IsNullOrWhiteSpace(bot.BusinessName) ? "the business" : bot.BusinessName)}.");
        if (!string.IsNullOrWhiteSpace(bot.Description)) sb.AppendLine($"Assistant purpose: {bot.Description}");
        if (!string.IsNullOrWhiteSpace(bot.WebsiteUrl)) sb.AppendLine($"Official website: {bot.WebsiteUrl}");
        sb.AppendLine($"Respond in {bot.ResponseLanguage} with a {bot.ResponseTone} tone.");
        if (!string.IsNullOrWhiteSpace(bot.Personality)) sb.AppendLine($"Personality: {bot.Personality}.");
        if (!string.IsNullOrWhiteSpace(bot.FallbackMessage))
            sb.AppendLine($"If you cannot answer reliably from verified context, respond politely using: \"{bot.FallbackMessage}\".");
        if (bot.EnableHumanHandover && !string.IsNullOrWhiteSpace(bot.HumanHandoverEmail))
            sb.AppendLine($"If the visitor asks to speak with a human, offer human support contact at {bot.HumanHandoverEmail}.");
        if (bot.EnableFollowUpQuestions)
            sb.AppendLine("When helpful, conclude with one brief, relevant follow-up question.");
        sb.AppendLine($"Keep responses concise and well within {bot.MaxOutputTokens} tokens.");
        if (!string.IsNullOrWhiteSpace(bot.SystemInstructions))
        {
            sb.AppendLine("Additional business instructions:");
            sb.AppendLine(bot.SystemInstructions.Trim());
        }

        if (chunks.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("--- BUSINESS KNOWLEDGE BASE CONTEXT (GROUNDED SOURCES) ---");
            for (var i = 0; i < chunks.Count; i++)
            {
                var c = chunks[i];
                var uriNote = string.IsNullOrWhiteSpace(c.SourceUri) ? string.Empty : $" | {c.SourceUri}";
                sb.AppendLine($"[Source {i + 1}: {c.SourceTitle} ({c.SourceType}{uriNote})]");
                sb.AppendLine(c.Snippet);
                sb.AppendLine();
            }
        }

        return sb.ToString();
    }

    private static bool IsUnansweredReply(string reply, string? fallbackMessage)
    {
        var normalized = (reply ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(normalized)) return true;
        if (!string.IsNullOrWhiteSpace(fallbackMessage) && fallbackMessage.Trim().Length > 12)
        {
            var fb = fallbackMessage.Trim().ToLowerInvariant();
            if (normalized.Contains(fb[..Math.Min(fb.Length, 48)], StringComparison.Ordinal))
                return true;
        }
        return normalized.Contains("i don't have enough information", StringComparison.Ordinal) ||
               normalized.Contains("i do not have enough information", StringComparison.Ordinal) ||
               normalized.Contains("not covered in the provided", StringComparison.Ordinal);
    }
}
