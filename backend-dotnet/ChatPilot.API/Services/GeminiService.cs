using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using ChatPilot.API.DTOs;
using ChatPilot.API.Interfaces;

namespace ChatPilot.API.Services;

public sealed class GeminiService : IGeminiService
{
    private readonly HttpClient _http;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GeminiService> _logger;

    private static readonly HashSet<string> SupportedModels = new(StringComparer.OrdinalIgnoreCase)
    {
        "gemini-4-hydrogen",
        "gemini-3.1-flash-lite",
        "gemini-4-neon",
        "gemini-4-carbon"
    };

    public GeminiService(HttpClient http, IConfiguration configuration, ILogger<GeminiService> logger)
    {
        _http = http;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<PlaygroundChatResponseDto> GenerateReplyAsync(
        string model,
        string systemInstruction,
        IReadOnlyList<PlaygroundTurnDto> history,
        string userMessage,
        decimal temperature,
        int maxOutputTokens,
        CancellationToken cancellationToken = default)
    {
        var apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY")
            ?? _configuration["Gemini:ApiKey"]
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(apiKey) || apiKey == "MY_GEMINI_API_KEY")
        {
            throw new InvalidOperationException(
                "Gemini API key is not configured on the server. Set GEMINI_API_KEY in environment secrets.");
        }

        if (!SupportedModels.Contains(model))
        {
            throw new InvalidOperationException($"Unsupported Gemini model '{model}'.");
        }

        var contents = new List<object>();
        foreach (var turn in history.TakeLast(16))
        {
            var normalizedRole = turn.Role.Equals("model", StringComparison.OrdinalIgnoreCase) ? "model" : "user";
            contents.Add(new
            {
                role = normalizedRole,
                parts = new[] { new { text = turn.Content } }
            });
        }

        contents.Add(new
        {
            role = "user",
            parts = new[] { new { text = userMessage } }
        });

        var isGemini4 = model.StartsWith("gemini-4-", StringComparison.OrdinalIgnoreCase);
        var generationConfig = isGemini4
            ? (object)new { thinkingConfig = new { thinkingLevel = "LOW" } }
            : new { temperature = (double)temperature, maxOutputTokens };

        var requestPayload = new
        {
            systemInstruction = new
            {
                parts = new[] { new { text = systemInstruction } }
            },
            contents,
            generationConfig
        };

        var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(model)}:generateContent";
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Add("x-goog-api-key", apiKey);
        request.Headers.Add("User-Agent", "aistudio-build");
        request.Content = new StringContent(JsonSerializer.Serialize(requestPayload), Encoding.UTF8, "application/json");

        var sw = Stopwatch.StartNew();
        try
        {
            using var response = await _http.SendAsync(request, cancellationToken);
            var rawJson = await response.Content.ReadAsStringAsync(cancellationToken);
            sw.Stop();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Gemini upstream error {StatusCode} on model {Model}", (int)response.StatusCode, model);
                if (response.StatusCode == HttpStatusCode.TooManyRequests)
                {
                    throw new InvalidOperationException("Gemini API rate limit or quota reached (429). Please retry shortly.");
                }
                if (response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == HttpStatusCode.Forbidden)
                {
                    throw new InvalidOperationException("Gemini API key was rejected (401/403). Verify GEMINI_API_KEY configuration.");
                }
                throw new InvalidOperationException($"Gemini API request failed with status {(int)response.StatusCode}.");
            }

            using var doc = JsonDocument.Parse(rawJson);
            var root = doc.RootElement;

            var replyText = string.Empty;
            if (root.TryGetProperty("candidates", out var candidates) && candidates.GetArrayLength() > 0)
            {
                var first = candidates[0];
                if (first.TryGetProperty("content", out var content) && content.TryGetProperty("parts", out var parts))
                {
                    var sb = new StringBuilder();
                    foreach (var part in parts.EnumerateArray())
                    {
                        if (part.TryGetProperty("text", out var t))
                        {
                            sb.Append(t.GetString());
                        }
                    }
                    replyText = sb.ToString().Trim();
                }
            }

            if (string.IsNullOrEmpty(replyText))
            {
                throw new InvalidOperationException("Gemini returned an empty response.");
            }

            var promptTokens = 0;
            var outputTokens = 0;
            var totalTokens = 0;
            if (root.TryGetProperty("usageMetadata", out var usage))
            {
                if (usage.TryGetProperty("promptTokenCount", out var p)) promptTokens = p.GetInt32();
                if (usage.TryGetProperty("candidatesTokenCount", out var c)) outputTokens = c.GetInt32();
                if (usage.TryGetProperty("totalTokenCount", out var tot)) totalTokens = tot.GetInt32();
            }

            return new PlaygroundChatResponseDto
            {
                Reply = replyText,
                Model = model,
                ResponseTimeMs = sw.ElapsedMilliseconds,
                Usage = new PlaygroundUsageDto
                {
                    PromptTokens = promptTokens,
                    OutputTokens = outputTokens,
                    TotalTokens = totalTokens
                }
            };
        }
        catch (TaskCanceledException)
        {
            throw new InvalidOperationException("Gemini API request timed out. Please try again.");
        }
    }

    public async Task<IReadOnlyList<double[]>> GenerateEmbeddingsAsync(
        IReadOnlyList<string> texts,
        CancellationToken cancellationToken = default)
    {
        if (texts.Count == 0) return Array.Empty<double[]>();

        var apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY")
            ?? _configuration["Gemini:ApiKey"]
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(apiKey) || apiKey == "MY_GEMINI_API_KEY")
        {
            throw new InvalidOperationException(
                "Gemini API key is not configured on the server. Set GEMINI_API_KEY in environment secrets.");
        }

        const string embeddingModel = "models/gemini-embedding-2";
        var allVectors = new List<double[]>(texts.Count);

        for (var i = 0; i < texts.Count; i += 20)
        {
            var batch = texts.Skip(i).Take(20).ToList();
            var payload = new
            {
                requests = batch.Select(t => new
                {
                    model = embeddingModel,
                    content = new { parts = new[] { new { text = t } } }
                })
            };

            var endpoint = $"https://generativelanguage.googleapis.com/v1beta/{embeddingModel}:batchEmbedContents";
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
            request.Headers.Add("x-goog-api-key", apiKey);
            request.Headers.Add("User-Agent", "aistudio-build");
            request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            using var response = await _http.SendAsync(request, cancellationToken);
            var rawJson = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Gemini embedding upstream error {StatusCode}", (int)response.StatusCode);
                throw new InvalidOperationException($"Gemini embedding request failed with status {(int)response.StatusCode}.");
            }

            using var doc = JsonDocument.Parse(rawJson);
            if (!doc.RootElement.TryGetProperty("embeddings", out var embeddings))
                throw new InvalidOperationException("Gemini embedding response missing vectors.");

            foreach (var item in embeddings.EnumerateArray())
            {
                if (!item.TryGetProperty("values", out var values))
                    throw new InvalidOperationException("Gemini embedding entry missing values.");

                var vec = values.EnumerateArray().Select(v => v.GetDouble()).ToArray();
                allVectors.Add(vec);
            }
        }

        return allVectors;
    }
}
