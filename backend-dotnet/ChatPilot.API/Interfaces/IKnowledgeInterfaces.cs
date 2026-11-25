using ChatPilot.API.DTOs;
using ChatPilot.API.Models;

namespace ChatPilot.API.Interfaces;

public interface IKnowledgeRepository
{
    Task<(IEnumerable<KnowledgeSourceEntity> Items, int Total)> ListByChatbotAsync(
        int chatbotId, int businessId, string? search, string? sourceType, string? status, int page, int pageSize);
    Task<(KnowledgeSourceEntity? Source, IEnumerable<KnowledgeChunkEntity> Chunks)> GetByIdAsync(
        int sourceId, int chatbotId, int businessId);
    Task<int> CreateSourceAsync(
        int chatbotId, int businessId, string sourceType, string title, string? sourceUri,
        string? fileName, long? fileSizeBytes, string? rawText, string? faqQuestion, string? faqAnswer, string status);
    Task<bool> UpdateSourceContentAsync(
        int sourceId, int chatbotId, int businessId, string title, string rawText, string? faqQuestion, string? faqAnswer);
    Task SetSourceStatusAsync(int sourceId, int businessId, string status, string? errorMessage, int chunkCount, int totalTokens);
    Task DeleteChunksBySourceAsync(int sourceId, int businessId);
    Task InsertChunkAsync(int sourceId, int chatbotId, int businessId, int chunkIndex, string content, string embeddingJson, int tokenCount);
    Task<bool> DeleteSourceAsync(int sourceId, int chatbotId, int businessId);
    Task<IReadOnlyList<KnowledgeChunkRetrievalRecord>> ListChunksForRetrievalAsync(int chatbotId, int businessId);
    Task<KnowledgeStatsRecord> GetStatsAsync(int chatbotId, int businessId);
}

public interface IDocumentExtractorService
{
    Task<(string SourceType, string SafeFileName, string Text)> ExtractAsync(string fileName, string contentType, Stream contentStream, long lengthBytes);
}

public interface IWebsiteCrawlerService
{
    Task<(string Title, string FinalUrl, int PagesCrawled, string Text)> CrawlAsync(string url, string crawlMode, int maxPages, CancellationToken ct = default);
}

public interface IRagService
{
    Task<(int ChunkCount, int TotalTokens)> IndexSourceAsync(int sourceId, int chatbotId, int businessId, string rawText, CancellationToken ct = default);
    Task<IReadOnlyList<RagCitationDto>> RetrieveAsync(int chatbotId, int businessId, string query, int topK = 5, double minScore = 0.28, CancellationToken ct = default);
}

public interface IKnowledgeService
{
    Task<object> ListAsync(int chatbotId, int businessId, string? search, string? type, string? status, int page, int pageSize);
    Task<object> GetByIdAsync(int sourceId, int chatbotId, int businessId);
    Task<KnowledgeSourceEntity> UploadDocumentAsync(int chatbotId, int businessId, int userId, string fileName, string contentType, Stream stream, long lengthBytes, string? customTitle, string? ipAddress);
    Task<KnowledgeSourceEntity> IngestWebsiteAsync(int chatbotId, int businessId, int userId, IngestWebsiteRequestDto dto, string? ipAddress);
    Task<KnowledgeSourceEntity> CreateFaqAsync(int chatbotId, int businessId, int userId, CreateFaqSourceRequestDto dto, string? ipAddress);
    Task<KnowledgeSourceEntity> CreateManualAsync(int chatbotId, int businessId, int userId, CreateManualSourceRequestDto dto, string? ipAddress);
    Task<KnowledgeSourceEntity> UpdateContentAsync(int sourceId, int chatbotId, int businessId, int userId, UpdateKnowledgeSourceRequestDto dto, string? ipAddress);
    Task<KnowledgeSourceEntity> ReindexAsync(int sourceId, int chatbotId, int businessId, int userId, bool refreshCrawl, string? ipAddress);
    Task DeleteAsync(int sourceId, int chatbotId, int businessId, int userId, string? ipAddress);
    Task<IReadOnlyList<RagCitationDto>> SearchAsync(int chatbotId, int businessId, RagSearchRequestDto dto);
}
