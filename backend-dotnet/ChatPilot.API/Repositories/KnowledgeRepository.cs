using System.Data;
using ChatPilot.API.Interfaces;
using ChatPilot.API.Models;
using Dapper;

namespace ChatPilot.API.Repositories;

public sealed class KnowledgeRepository : IKnowledgeRepository
{
    private readonly SqlConnectionFactory _connectionFactory;

    public KnowledgeRepository(SqlConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<(IEnumerable<KnowledgeSourceEntity> Items, int Total)> ListByChatbotAsync(
        int chatbotId, int businessId, string? search, string? sourceType, string? status, int page, int pageSize)
    {
        using var conn = _connectionFactory.CreateConnection();
        using var multi = await conn.QueryMultipleAsync(
            "dbo.usp_KnowledgeSources_ListByChatbot",
            new
            {
                ChatbotId = chatbotId,
                BusinessId = businessId,
                Search = search,
                SourceType = sourceType,
                Status = status,
                Page = page,
                PageSize = pageSize
            },
            commandType: CommandType.StoredProcedure);

        var items = (await multi.ReadAsync<KnowledgeSourceEntity>()).ToList();
        var total = await multi.ReadSingleAsync<int>();
        return (items, total);
    }

    public async Task<(KnowledgeSourceEntity? Source, IEnumerable<KnowledgeChunkEntity> Chunks)> GetByIdAsync(
        int sourceId, int chatbotId, int businessId)
    {
        using var conn = _connectionFactory.CreateConnection();
        using var multi = await conn.QueryMultipleAsync(
            "dbo.usp_KnowledgeSources_GetById",
            new { SourceId = sourceId, ChatbotId = chatbotId, BusinessId = businessId },
            commandType: CommandType.StoredProcedure);

        var source = await multi.ReadSingleOrDefaultAsync<KnowledgeSourceEntity>();
        var chunks = source is null
            ? Enumerable.Empty<KnowledgeChunkEntity>()
            : (await multi.ReadAsync<KnowledgeChunkEntity>()).ToList();

        return (source, chunks);
    }

    public async Task<int> CreateSourceAsync(
        int chatbotId, int businessId, string sourceType, string title, string? sourceUri,
        string? fileName, long? fileSizeBytes, string? rawText, string? faqQuestion, string? faqAnswer, string status)
    {
        using var conn = _connectionFactory.CreateConnection();
        return await conn.QuerySingleAsync<int>(
            "dbo.usp_KnowledgeSources_Create",
            new
            {
                ChatbotId = chatbotId,
                BusinessId = businessId,
                SourceType = sourceType,
                Title = title,
                SourceUri = sourceUri,
                FileName = fileName,
                FileSizeBytes = fileSizeBytes,
                RawText = rawText,
                FaqQuestion = faqQuestion,
                FaqAnswer = faqAnswer,
                Status = status
            },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<bool> UpdateSourceContentAsync(
        int sourceId, int chatbotId, int businessId, string title, string rawText, string? faqQuestion, string? faqAnswer)
    {
        using var conn = _connectionFactory.CreateConnection();
        var affected = await conn.QuerySingleAsync<int>(
            "dbo.usp_KnowledgeSources_UpdateContent",
            new
            {
                SourceId = sourceId,
                ChatbotId = chatbotId,
                BusinessId = businessId,
                Title = title,
                RawText = rawText,
                FaqQuestion = faqQuestion,
                FaqAnswer = faqAnswer
            },
            commandType: CommandType.StoredProcedure);
        return affected > 0;
    }

    public async Task SetSourceStatusAsync(
        int sourceId, int businessId, string status, string? errorMessage, int chunkCount, int totalTokens)
    {
        using var conn = _connectionFactory.CreateConnection();
        await conn.ExecuteAsync(
            "dbo.usp_KnowledgeSources_SetStatus",
            new
            {
                SourceId = sourceId,
                BusinessId = businessId,
                Status = status,
                ErrorMessage = errorMessage,
                ChunkCount = chunkCount,
                TotalTokens = totalTokens
            },
            commandType: CommandType.StoredProcedure);
    }

    public async Task DeleteChunksBySourceAsync(int sourceId, int businessId)
    {
        using var conn = _connectionFactory.CreateConnection();
        await conn.ExecuteAsync(
            "dbo.usp_KnowledgeChunks_DeleteBySource",
            new { SourceId = sourceId, BusinessId = businessId },
            commandType: CommandType.StoredProcedure);
    }

    public async Task InsertChunkAsync(
        int sourceId, int chatbotId, int businessId, int chunkIndex, string content, string embeddingJson, int tokenCount)
    {
        using var conn = _connectionFactory.CreateConnection();
        await conn.ExecuteAsync(
            "dbo.usp_KnowledgeChunks_Insert",
            new
            {
                SourceId = sourceId,
                ChatbotId = chatbotId,
                BusinessId = businessId,
                ChunkIndex = chunkIndex,
                Content = content,
                EmbeddingJson = embeddingJson,
                TokenCount = tokenCount
            },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<bool> DeleteSourceAsync(int sourceId, int chatbotId, int businessId)
    {
        using var conn = _connectionFactory.CreateConnection();
        var deleted = await conn.QuerySingleAsync<int>(
            "dbo.usp_KnowledgeSources_Delete",
            new { SourceId = sourceId, ChatbotId = chatbotId, BusinessId = businessId },
            commandType: CommandType.StoredProcedure);
        return deleted > 0;
    }

    public async Task<IReadOnlyList<KnowledgeChunkRetrievalRecord>> ListChunksForRetrievalAsync(int chatbotId, int businessId)
    {
        using var conn = _connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<KnowledgeChunkRetrievalRecord>(
            "dbo.usp_KnowledgeChunks_ListForRetrieval",
            new { ChatbotId = chatbotId, BusinessId = businessId },
            commandType: CommandType.StoredProcedure);
        return rows.ToList();
    }

    public async Task<KnowledgeStatsRecord> GetStatsAsync(int chatbotId, int businessId)
    {
        using var conn = _connectionFactory.CreateConnection();
        return await conn.QuerySingleAsync<KnowledgeStatsRecord>(
            "dbo.usp_KnowledgeStats_ByChatbot",
            new { ChatbotId = chatbotId, BusinessId = businessId },
            commandType: CommandType.StoredProcedure);
    }
}
