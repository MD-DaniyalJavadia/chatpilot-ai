using System.ComponentModel.DataAnnotations;

namespace ChatPilot.API.DTOs;

public sealed class IngestWebsiteRequestDto
{
    [Required, MaxLength(1000)]
    public string Url { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Title { get; set; }

    public string CrawlMode { get; set; } = "single"; // single | crawl

    [Range(1, 10)]
    public int MaxPages { get; set; } = 1;
}

public sealed class CreateFaqSourceRequestDto
{
    [Required, MinLength(5), MaxLength(500)]
    public string Question { get; set; } = string.Empty;

    [Required, MinLength(5), MaxLength(8000)]
    public string Answer { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Title { get; set; }
}

public sealed class CreateManualSourceRequestDto
{
    [Required, MinLength(2), MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required, MinLength(15), MaxLength(100000)]
    public string Content { get; set; } = string.Empty;
}

public sealed class UpdateKnowledgeSourceRequestDto
{
    [MaxLength(200)]
    public string? Title { get; set; }

    [MaxLength(500)]
    public string? Question { get; set; }

    [MaxLength(8000)]
    public string? Answer { get; set; }

    [MaxLength(100000)]
    public string? Content { get; set; }
}

public sealed class ReindexSourceRequestDto
{
    public bool RefreshCrawl { get; set; }
}

public sealed class RagSearchRequestDto
{
    [Required, MinLength(1), MaxLength(1000)]
    public string Query { get; set; } = string.Empty;

    [Range(1, 10)]
    public int TopK { get; set; } = 5;
}

public sealed class RagCitationDto
{
    public int ChunkId { get; set; }
    public int SourceId { get; set; }
    public string SourceTitle { get; set; } = string.Empty;
    public string SourceType { get; set; } = string.Empty;
    public string? SourceUri { get; set; }
    public int ChunkIndex { get; set; }
    public double Score { get; set; }
    public string Snippet { get; set; } = string.Empty;
    public string? Content { get; set; }
}

public sealed class PlaygroundRagDto
{
    public bool Enabled { get; set; }
    public int IndexedChunksAvailable { get; set; }
    public int RetrievedCount { get; set; }
    public List<RagCitationDto> Citations { get; set; } = new();
}
