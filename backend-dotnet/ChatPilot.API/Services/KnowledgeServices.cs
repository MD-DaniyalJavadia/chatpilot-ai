using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using ChatPilot.API.DTOs;
using ChatPilot.API.Interfaces;
using ChatPilot.API.Models;

namespace ChatPilot.API.Services;

public sealed class DocumentExtractorService : IDocumentExtractorService
{
    private const long MaxBytes = 10 * 1024 * 1024;

    public async Task<(string SourceType, string SafeFileName, string Text)> ExtractAsync(
        string fileName, string contentType, Stream contentStream, long lengthBytes)
    {
        if (lengthBytes <= 0 || lengthBytes > MaxBytes)
        {
            throw new InvalidOperationException("Uploaded file must be between 1 byte and 10 MB.");
        }

        var safeName = Path.GetFileName(fileName ?? "document");
        var ext = Path.GetExtension(safeName).ToLowerInvariant();

        using var ms = new MemoryStream();
        await contentStream.CopyToAsync(ms);
        var bytes = ms.ToArray();

        if (ext is ".txt" or ".md")
        {
            if (bytes.Take(4096).Any(b => b == 0))
                throw new InvalidOperationException("Text file appears to contain binary content.");
            var text = NormalizeText(Encoding.UTF8.GetString(bytes));
            if (text.Length < 10)
                throw new InvalidOperationException("Uploaded text file contains insufficient text.");
            return ("TXT", safeName, text);
        }

        if (ext == ".docx")
        {
            if (bytes.Length < 4 || bytes[0] != 0x50 || bytes[1] != 0x4B)
                throw new InvalidOperationException("Invalid DOCX signature.");
            var text = NormalizeText(ExtractDocxText(bytes));
            if (text.Length < 10)
                throw new InvalidOperationException("No readable text found inside DOCX document.");
            return ("DOCX", safeName, text);
        }

        if (ext == ".pdf")
        {
            if (bytes.Length < 5 || Encoding.ASCII.GetString(bytes, 0, 5) != "%PDF-")
                throw new InvalidOperationException("Invalid PDF signature.");
            // Production ASP.NET Core deployments can plug in PdfPig/iText; extract readable ASCII/UTF text operators as baseline.
            var text = NormalizeText(ExtractBasicPdfStrings(bytes));
            if (text.Length < 10)
                throw new InvalidOperationException("No readable text could be extracted from the PDF.");
            return ("PDF", safeName, text);
        }

        throw new InvalidOperationException("Unsupported document format. Allowed: PDF, DOCX, TXT, MD.");
    }

    private static string ExtractDocxText(byte[] bytes)
    {
        using var zipStream = new MemoryStream(bytes);
        using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read);
        var entry = archive.GetEntry("word/document.xml")
            ?? throw new InvalidOperationException("Invalid DOCX structure: word/document.xml missing.");
        using var entryStream = entry.Open();
        var doc = XDocument.Load(entryStream);
        XNamespace w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        var paragraphs = doc.Descendants(w + "p")
            .Select(p => string.Concat(p.Descendants(w + "t").Select(t => t.Value)))
            .Where(line => !string.IsNullOrWhiteSpace(line));
        return string.Join("\n", paragraphs);
    }

    private static string ExtractBasicPdfStrings(byte[] bytes)
    {
        var raw = Encoding.Latin1.GetString(bytes);
        var matches = Regex.Matches(raw, @"\(([^()\\]{2,200})\)");
        var sb = new StringBuilder();
        foreach (Match m in matches)
        {
            sb.Append(m.Groups[1].Value).Append(' ');
        }
        return sb.ToString();
    }

    internal static string NormalizeText(string input)
    {
        var clean = Regex.Replace(input.Replace("\0", ""), @"\r\n|\r", "\n");
        clean = Regex.Replace(clean, @"[ \t]+", " ");
        clean = Regex.Replace(clean, @"\n{3,}", "\n\n");
        return clean.Trim();
    }
}

public sealed class WebsiteCrawlerService : IWebsiteCrawlerService
{
    private readonly IHttpClientFactory _httpClientFactory;

    public WebsiteCrawlerService(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public async Task<(string Title, string FinalUrl, int PagesCrawled, string Text)> CrawlAsync(
        string url, string crawlMode, int maxPages, CancellationToken ct = default)
    {
        var startUri = await ValidateSafePublicUriAsync(url);
        var pagesLimit = crawlMode.Equals("crawl", StringComparison.OrdinalIgnoreCase)
            ? Math.Clamp(maxPages, 1, 10)
            : 1;

        var client = _httpClientFactory.CreateClient("WebsiteCrawler");
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var queue = new Queue<Uri>();
        queue.Enqueue(startUri);

        var sections = new List<string>();
        string primaryTitle = startUri.Host;
        string finalUrl = startUri.ToString();

        while (queue.Count > 0 && visited.Count < pagesLimit)
        {
            var next = queue.Dequeue();
            var canonical = next.ToString().TrimEnd('/');
            if (!visited.Add(canonical)) continue;

            var (resolvedUri, html) = await FetchSafeHtmlAsync(client, next, ct);
            if (visited.Count == 1) finalUrl = resolvedUri.ToString();

            var titleMatch = Regex.Match(html, @"<title[^>]*>(.*?)</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline);
            var pageTitle = titleMatch.Success ? WebUtility.HtmlDecode(titleMatch.Groups[1].Value).Trim() : resolvedUri.Host;
            if (visited.Count == 1 && !string.IsNullOrWhiteSpace(pageTitle))
                primaryTitle = pageTitle;

            var stripped = Regex.Replace(html, @"<(script|style|noscript|svg|nav|footer)[^>]*>[\s\S]*?</\1>", " ", RegexOptions.IgnoreCase);
            stripped = Regex.Replace(stripped, @"<[^>]+>", "\n");
            var normalized = DocumentExtractorService.NormalizeText(WebUtility.HtmlDecode(stripped));

            if (normalized.Length >= 20)
            {
                sections.Add($"Page: {resolvedUri} ({pageTitle})\n{normalized}");
            }

            if (crawlMode.Equals("crawl", StringComparison.OrdinalIgnoreCase))
            {
                foreach (Match linkMatch in Regex.Matches(html, @"href\s*=\s*[""']([^""'#]+)[""']", RegexOptions.IgnoreCase))
                {
                    if (Uri.TryCreate(resolvedUri, linkMatch.Groups[1].Value, out var candidate)
                        && (candidate.Scheme == Uri.UriSchemeHttp || candidate.Scheme == Uri.UriSchemeHttps)
                        && string.Equals(candidate.Authority, resolvedUri.Authority, StringComparison.OrdinalIgnoreCase))
                    {
                        queue.Enqueue(candidate);
                    }
                }
            }
        }

        var combined = DocumentExtractorService.NormalizeText(string.Join("\n\n---\n\n", sections));
        if (combined.Length < 20)
            throw new InvalidOperationException("No readable content could be extracted from this webpage.");

        return (primaryTitle, finalUrl, sections.Count, combined);
    }

    private static async Task<(Uri FinalUri, string Body)> FetchSafeHtmlAsync(HttpClient client, Uri uri, CancellationToken ct)
    {
        var current = uri;
        for (var hop = 0; hop <= 3; hop++)
        {
            await ValidateSafePublicUriAsync(current.ToString());
            using var req = new HttpRequestMessage(HttpMethod.Get, current);
            req.Headers.Add("User-Agent", "ChatPilot-KnowledgeCrawler/1.0");
            using var res = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);

            if ((int)res.StatusCode >= 300 && (int)res.StatusCode < 400 && res.Headers.Location is not null)
            {
                var nextUri = new Uri(current, res.Headers.Location);
                current = await ValidateSafePublicUriAsync(nextUri.ToString());
                continue;
            }

            if (!res.IsSuccessStatusCode)
                throw new InvalidOperationException($"Website returned HTTP {(int)res.StatusCode}.");

            var body = await res.Content.ReadAsStringAsync(ct);
            return (current, body.Length > 2_000_000 ? body[..2_000_000] : body);
        }

        throw new InvalidOperationException("Website exceeded maximum redirect hops.");
    }

    private static async Task<Uri> ValidateSafePublicUriAsync(string rawUrl)
    {
        if (!Uri.TryCreate(rawUrl.Trim(), UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException("Only valid http:// and https:// URLs are permitted.");
        }

        if (!string.IsNullOrEmpty(uri.UserInfo))
            throw new InvalidOperationException("Embedded URL credentials are not permitted.");

        var host = uri.Host.ToLowerInvariant();
        if (host is "localhost" or "127.0.0.1" or "::1" or "169.254.169.254" or "metadata.google.internal"
            || host.EndsWith(".local") || host.EndsWith(".internal") || host.EndsWith(".localhost"))
        {
            throw new InvalidOperationException("Internal or loopback network addresses are not permitted.");
        }

        var addresses = await Dns.GetHostAddressesAsync(host);
        if (addresses.Length == 0)
            throw new InvalidOperationException($"Unable to resolve hostname '{host}'.");

        foreach (var ip in addresses)
        {
            if (IsPrivateOrReserved(ip))
                throw new InvalidOperationException("Target URL resolves to a restricted private or internal network IP.");
        }

        return uri;
    }

    private static bool IsPrivateOrReserved(IPAddress ip)
    {
        if (IPAddress.IsLoopback(ip)) return true;
        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            return ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast || ip.Equals(IPAddress.IPv6Any);
        }

        var b = ip.GetAddressBytes();
        return b[0] == 0
            || b[0] == 10
            || b[0] == 127
            || (b[0] == 169 && b[1] == 254)
            || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
            || (b[0] == 192 && b[1] == 168)
            || (b[0] == 100 && b[1] >= 64 && b[1] <= 127)
            || b[0] >= 224;
    }
}

public sealed class RagService : IRagService
{
    private readonly IKnowledgeRepository _knowledge;
    private readonly IGeminiService _gemini;

    public RagService(IKnowledgeRepository knowledge, IGeminiService gemini)
    {
        _knowledge = knowledge;
        _gemini = gemini;
    }

    public async Task<(int ChunkCount, int TotalTokens)> IndexSourceAsync(
        int sourceId, int chatbotId, int businessId, string rawText, CancellationToken ct = default)
    {
        var chunks = ChunkText(rawText, 1000, 180);
        if (chunks.Count == 0)
            throw new InvalidOperationException("No content available to chunk and index.");

        var embeddings = await _gemini.GenerateEmbeddingsAsync(chunks, ct);

        await _knowledge.DeleteChunksBySourceAsync(sourceId, businessId);
        var totalTokens = 0;

        for (var i = 0; i < chunks.Count; i++)
        {
            var tokenCount = Math.Max(1, (int)Math.Ceiling(chunks[i].Length / 4.0));
            totalTokens += tokenCount;
            var jsonVec = JsonSerializer.Serialize(embeddings[i]);
            await _knowledge.InsertChunkAsync(sourceId, chatbotId, businessId, i, chunks[i], jsonVec, tokenCount);
        }

        await _knowledge.SetSourceStatusAsync(sourceId, businessId, "Indexed", null, chunks.Count, totalTokens);
        return (chunks.Count, totalTokens);
    }

    public async Task<IReadOnlyList<RagCitationDto>> RetrieveAsync(
        int chatbotId, int businessId, string query, int topK = 5, double minScore = 0.28, CancellationToken ct = default)
    {
        var allChunks = await _knowledge.ListChunksForRetrievalAsync(chatbotId, businessId);
        if (allChunks.Count == 0)
            return Array.Empty<RagCitationDto>();

        var queryVecs = await _gemini.GenerateEmbeddingsAsync(new[] { query }, ct);
        var queryVec = queryVecs[0];

        var results = new List<RagCitationDto>();
        foreach (var chunk in allChunks)
        {
            var vec = JsonSerializer.Deserialize<double[]>(chunk.EmbeddingJson);
            if (vec is null || vec.Length == 0) continue;

            var score = CosineSimilarity(queryVec, vec);
            if (score < minScore) continue;

            results.Add(new RagCitationDto
            {
                ChunkId = chunk.ChunkId,
                SourceId = chunk.SourceId,
                SourceTitle = chunk.SourceTitle,
                SourceType = chunk.SourceType,
                SourceUri = chunk.SourceUri,
                ChunkIndex = chunk.ChunkIndex,
                Score = Math.Round(score, 4),
                Snippet = chunk.Content.Length > 220 ? chunk.Content[..220] + "..." : chunk.Content,
                Content = chunk.Content
            });
        }

        return results.OrderByDescending(r => r.Score).Take(Math.Clamp(topK, 1, 10)).ToList();
    }

    private static List<string> ChunkText(string text, int maxChars, int overlapChars)
    {
        var cleaned = text.Replace("\r\n", "\n").Trim();
        var chunks = new List<string>();
        if (string.IsNullOrEmpty(cleaned)) return chunks;
        if (cleaned.Length <= maxChars)
        {
            chunks.Add(cleaned);
            return chunks;
        }

        var start = 0;
        while (start < cleaned.Length)
        {
            var end = Math.Min(cleaned.Length, start + maxChars);
            if (end < cleaned.Length)
            {
                var minAcceptable = start + (int)(maxChars * 0.45);
                var spaceIdx = cleaned.LastIndexOf(' ', end - 1, end - start);
                if (spaceIdx >= minAcceptable) end = spaceIdx;
            }

            var piece = cleaned[start..end].Trim();
            if (!string.IsNullOrEmpty(piece)) chunks.Add(piece);
            if (end >= cleaned.Length) break;
            start = Math.Max(start + 1, end - overlapChars);
        }

        return chunks;
    }

    private static double CosineSimilarity(IReadOnlyList<double> a, IReadOnlyList<double> b)
    {
        var len = Math.Min(a.Count, b.Count);
        if (len == 0) return 0;

        double dot = 0, normA = 0, normB = 0;
        for (var i = 0; i < len; i++)
        {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        var denom = Math.Sqrt(normA) * Math.Sqrt(normB);
        return denom > 0 ? dot / denom : 0;
    }
}

public sealed class KnowledgeService : IKnowledgeService
{
    private readonly IKnowledgeRepository _knowledge;
    private readonly IChatbotRepository _chatbots;
    private readonly IDocumentExtractorService _extractor;
    private readonly IWebsiteCrawlerService _crawler;
    private readonly IRagService _rag;
    private readonly IAuditLogRepository _audit;

    public KnowledgeService(
        IKnowledgeRepository knowledge,
        IChatbotRepository chatbots,
        IDocumentExtractorService extractor,
        IWebsiteCrawlerService crawler,
        IRagService rag,
        IAuditLogRepository audit)
    {
        _knowledge = knowledge;
        _chatbots = chatbots;
        _extractor = extractor;
        _crawler = crawler;
        _rag = rag;
        _audit = audit;
    }

    public async Task<object> ListAsync(
        int chatbotId, int businessId, string? search, string? type, string? status, int page, int pageSize)
    {
        var bot = await _chatbots.GetByIdAsync(chatbotId, businessId)
            ?? throw new KeyNotFoundException("Chatbot not found in your business workspace.");
        var (items, total) = await _knowledge.ListByChatbotAsync(chatbotId, businessId, search, type, status, page, pageSize);
        var stats = await _knowledge.GetStatsAsync(chatbotId, businessId);
        return new { chatbot = new { bot.ChatbotId, bot.Name }, items, total, page, pageSize, stats };
    }

    public async Task<object> GetByIdAsync(int sourceId, int chatbotId, int businessId)
    {
        var (source, chunks) = await _knowledge.GetByIdAsync(sourceId, chatbotId, businessId);
        if (source is null) throw new KeyNotFoundException("Knowledge source not found.");
        return new { source, chunks };
    }

    public async Task<KnowledgeSourceEntity> UploadDocumentAsync(
        int chatbotId, int businessId, int userId, string fileName, string contentType, Stream stream, long lengthBytes, string? customTitle, string? ipAddress)
    {
        _ = await _chatbots.GetByIdAsync(chatbotId, businessId)
            ?? throw new KeyNotFoundException("Chatbot not found in your business workspace.");

        var (sourceType, safeFileName, text) = await _extractor.ExtractAsync(fileName, contentType, stream, lengthBytes);
        var title = string.IsNullOrWhiteSpace(customTitle) ? safeFileName : customTitle.Trim();

        var sourceId = await _knowledge.CreateSourceAsync(
            chatbotId, businessId, sourceType, title, null, safeFileName, lengthBytes, text, null, null, "Processing");

        try
        {
            await _rag.IndexSourceAsync(sourceId, chatbotId, businessId, text);
            await _audit.InsertAsync(userId, businessId, "KnowledgeDocumentUploaded", "KnowledgeSource", sourceId.ToString(), $"Indexed {sourceType} '{title}'", ipAddress);
        }
        catch (Exception ex)
        {
            await _knowledge.SetSourceStatusAsync(sourceId, businessId, "Failed", ex.Message, 0, 0);
            throw;
        }

        var (created, _) = await _knowledge.GetByIdAsync(sourceId, chatbotId, businessId);
        return created!;
    }

    public async Task<KnowledgeSourceEntity> IngestWebsiteAsync(
        int chatbotId, int businessId, int userId, IngestWebsiteRequestDto dto, string? ipAddress)
    {
        _ = await _chatbots.GetByIdAsync(chatbotId, businessId)
            ?? throw new KeyNotFoundException("Chatbot not found in your business workspace.");

        var (title, finalUrl, _, text) = await _crawler.CrawlAsync(dto.Url, dto.CrawlMode, dto.MaxPages);
        var effectiveTitle = string.IsNullOrWhiteSpace(dto.Title) ? title : dto.Title.Trim();

        var sourceId = await _knowledge.CreateSourceAsync(
            chatbotId, businessId, "URL", effectiveTitle, finalUrl, null, null, text, null, null, "Processing");

        try
        {
            await _rag.IndexSourceAsync(sourceId, chatbotId, businessId, text);
            await _audit.InsertAsync(userId, businessId, "KnowledgeWebsiteIngested", "KnowledgeSource", sourceId.ToString(), $"Indexed URL '{finalUrl}'", ipAddress);
        }
        catch (Exception ex)
        {
            await _knowledge.SetSourceStatusAsync(sourceId, businessId, "Failed", ex.Message, 0, 0);
            throw;
        }

        var (created, _) = await _knowledge.GetByIdAsync(sourceId, chatbotId, businessId);
        return created!;
    }

    public async Task<KnowledgeSourceEntity> CreateFaqAsync(
        int chatbotId, int businessId, int userId, CreateFaqSourceRequestDto dto, string? ipAddress)
    {
        _ = await _chatbots.GetByIdAsync(chatbotId, businessId)
            ?? throw new KeyNotFoundException("Chatbot not found in your business workspace.");

        var title = string.IsNullOrWhiteSpace(dto.Title) ? dto.Question.Trim() : dto.Title.Trim();
        var rawText = $"FAQ Question: {dto.Question.Trim()}\nFAQ Answer: {dto.Answer.Trim()}";

        var sourceId = await _knowledge.CreateSourceAsync(
            chatbotId, businessId, "FAQ", title, null, null, null, rawText, dto.Question.Trim(), dto.Answer.Trim(), "Processing");

        try
        {
            await _rag.IndexSourceAsync(sourceId, chatbotId, businessId, rawText);
            await _audit.InsertAsync(userId, businessId, "KnowledgeFaqCreated", "KnowledgeSource", sourceId.ToString(), $"Indexed FAQ '{title}'", ipAddress);
        }
        catch (Exception ex)
        {
            await _knowledge.SetSourceStatusAsync(sourceId, businessId, "Failed", ex.Message, 0, 0);
            throw;
        }

        var (created, _) = await _knowledge.GetByIdAsync(sourceId, chatbotId, businessId);
        return created!;
    }

    public async Task<KnowledgeSourceEntity> CreateManualAsync(
        int chatbotId, int businessId, int userId, CreateManualSourceRequestDto dto, string? ipAddress)
    {
        _ = await _chatbots.GetByIdAsync(chatbotId, businessId)
            ?? throw new KeyNotFoundException("Chatbot not found in your business workspace.");

        var title = dto.Title.Trim();
        var rawText = DocumentExtractorService.NormalizeText(dto.Content);

        var sourceId = await _knowledge.CreateSourceAsync(
            chatbotId, businessId, "Manual", title, null, null, null, rawText, null, null, "Processing");

        try
        {
            await _rag.IndexSourceAsync(sourceId, chatbotId, businessId, rawText);
            await _audit.InsertAsync(userId, businessId, "KnowledgeManualCreated", "KnowledgeSource", sourceId.ToString(), $"Indexed manual entry '{title}'", ipAddress);
        }
        catch (Exception ex)
        {
            await _knowledge.SetSourceStatusAsync(sourceId, businessId, "Failed", ex.Message, 0, 0);
            throw;
        }

        var (created, _) = await _knowledge.GetByIdAsync(sourceId, chatbotId, businessId);
        return created!;
    }

    public async Task<KnowledgeSourceEntity> UpdateContentAsync(
        int sourceId, int chatbotId, int businessId, int userId, UpdateKnowledgeSourceRequestDto dto, string? ipAddress)
    {
        var (existing, _) = await _knowledge.GetByIdAsync(sourceId, chatbotId, businessId);
        if (existing is null) throw new KeyNotFoundException("Knowledge source not found.");

        string nextTitle;
        string nextRawText;
        string? nextQuestion = null;
        string? nextAnswer = null;

        if (existing.SourceType == "FAQ")
        {
            if (string.IsNullOrWhiteSpace(dto.Question) || string.IsNullOrWhiteSpace(dto.Answer))
                throw new InvalidOperationException("FAQ question and answer are required.");
            nextQuestion = dto.Question.Trim();
            nextAnswer = dto.Answer.Trim();
            nextTitle = string.IsNullOrWhiteSpace(dto.Title) ? nextQuestion : dto.Title.Trim();
            nextRawText = $"FAQ Question: {nextQuestion}\nFAQ Answer: {nextAnswer}";
        }
        else if (existing.SourceType == "Manual")
        {
            if (string.IsNullOrWhiteSpace(dto.Title) || string.IsNullOrWhiteSpace(dto.Content))
                throw new InvalidOperationException("Title and content are required.");
            nextTitle = dto.Title.Trim();
            nextRawText = DocumentExtractorService.NormalizeText(dto.Content);
        }
        else
        {
            throw new InvalidOperationException("Only FAQ and Manual entries can be edited inline.");
        }

        await _knowledge.UpdateSourceContentAsync(sourceId, chatbotId, businessId, nextTitle, nextRawText, nextQuestion, nextAnswer);
        await _rag.IndexSourceAsync(sourceId, chatbotId, businessId, nextRawText);
        await _audit.InsertAsync(userId, businessId, "KnowledgeSourceUpdated", "KnowledgeSource", sourceId.ToString(), $"Updated '{nextTitle}'", ipAddress);

        var (updated, _) = await _knowledge.GetByIdAsync(sourceId, chatbotId, businessId);
        return updated!;
    }

    public async Task<KnowledgeSourceEntity> ReindexAsync(
        int sourceId, int chatbotId, int businessId, int userId, bool refreshCrawl, string? ipAddress)
    {
        var (existing, _) = await _knowledge.GetByIdAsync(sourceId, chatbotId, businessId);
        if (existing is null) throw new KeyNotFoundException("Knowledge source not found.");

        var rawText = existing.RawText ?? string.Empty;
        if (existing.SourceType == "URL" && !string.IsNullOrWhiteSpace(existing.SourceUri) && (refreshCrawl || string.IsNullOrWhiteSpace(rawText)))
        {
            var (_, _, _, crawledText) = await _crawler.CrawlAsync(existing.SourceUri, "single", 1);
            rawText = crawledText;
        }

        if (string.IsNullOrWhiteSpace(rawText))
            throw new InvalidOperationException("No source text is available to re-index.");

        await _rag.IndexSourceAsync(sourceId, chatbotId, businessId, rawText);
        await _audit.InsertAsync(userId, businessId, "KnowledgeSourceReindexed", "KnowledgeSource", sourceId.ToString(), $"Re-indexed '{existing.Title}'", ipAddress);

        var (updated, _) = await _knowledge.GetByIdAsync(sourceId, chatbotId, businessId);
        return updated!;
    }

    public async Task DeleteAsync(int sourceId, int chatbotId, int businessId, int userId, string? ipAddress)
    {
        var deleted = await _knowledge.DeleteSourceAsync(sourceId, chatbotId, businessId);
        if (!deleted) throw new KeyNotFoundException("Knowledge source not found.");

        await _audit.InsertAsync(userId, businessId, "KnowledgeSourceDeleted", "KnowledgeSource", sourceId.ToString(), $"Deleted source from chatbot {chatbotId}", ipAddress);
    }

    public Task<IReadOnlyList<RagCitationDto>> SearchAsync(int chatbotId, int businessId, RagSearchRequestDto dto)
        => _rag.RetrieveAsync(chatbotId, businessId, dto.Query.Trim(), dto.TopK, 0.20);
}
