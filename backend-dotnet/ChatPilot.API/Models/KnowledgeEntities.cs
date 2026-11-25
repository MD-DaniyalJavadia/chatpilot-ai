namespace ChatPilot.API.Models;

public sealed class KnowledgeSourceEntity
{
    public int SourceId { get; set; }
    public int ChatbotId { get; set; }
    public int BusinessId { get; set; }
    public string SourceType { get; set; } = string.Empty; // PDF, DOCX, TXT, URL, Manual, FAQ
    public string Title { get; set; } = string.Empty;
    public string? SourceUri { get; set; }
    public string? FileName { get; set; }
    public long? FileSizeBytes { get; set; }
    public string? RawText { get; set; }
    public string? FaqQuestion { get; set; }
    public string? FaqAnswer { get; set; }
    public string Status { get; set; } = "Pending"; // Pending, Processing, Indexed, Failed
    public string? ErrorMessage { get; set; }
    public int ChunkCount { get; set; }
    public int TotalTokens { get; set; }
    public DateTime? LastIndexedOn { get; set; }
    public DateTime CreatedOn { get; set; }
    public DateTime UpdatedOn { get; set; }
}

public sealed class KnowledgeChunkEntity
{
    public int ChunkId { get; set; }
    public int SourceId { get; set; }
    public int ChatbotId { get; set; }
    public int BusinessId { get; set; }
    public int ChunkIndex { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? EmbeddingJson { get; set; }
    public int TokenCount { get; set; }
    public DateTime CreatedOn { get; set; }
}

public sealed class KnowledgeChunkRetrievalRecord
{
    public int ChunkId { get; set; }
    public int SourceId { get; set; }
    public int ChunkIndex { get; set; }
    public string Content { get; set; } = string.Empty;
    public string EmbeddingJson { get; set; } = "[]";
    public int TokenCount { get; set; }
    public string SourceTitle { get; set; } = string.Empty;
    public string SourceType { get; set; } = string.Empty;
    public string? SourceUri { get; set; }
}

public sealed class KnowledgeStatsRecord
{
    public int TotalSources { get; set; }
    public int IndexedSources { get; set; }
    public int ProcessingSources { get; set; }
    public int FailedSources { get; set; }
    public int TotalChunks { get; set; }
    public int TotalTokens { get; set; }
}
