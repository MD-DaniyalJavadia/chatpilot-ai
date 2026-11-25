-- ============================================================================
-- ChatPilot AI - Phase 3: Knowledge Base & RAG Stored Procedures
-- File: 007_StoredProcedures_Phase3.sql
-- Target: Microsoft SQL Server 2019+ / Azure SQL
-- ============================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1. List Knowledge Sources for a Chatbot (Tenant-Isolated with Search, Filters & Pagination)
CREATE OR ALTER PROCEDURE dbo.usp_KnowledgeSources_ListByChatbot
    @ChatbotId   INT,
    @BusinessId  INT,
    @Search      NVARCHAR(200) = NULL,
    @SourceType  NVARCHAR(30) = NULL,
    @Status      NVARCHAR(30) = NULL,
    @Page        INT = 1,
    @PageSize    INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 OR @PageSize > 100 SET @PageSize = 20;

    DECLARE @Offset INT = (@Page - 1) * @PageSize;
    DECLARE @Pattern NVARCHAR(210) = CASE WHEN NULLIF(LTRIM(RTRIM(@Search)), '') IS NOT NULL
                                          THEN '%' + LTRIM(RTRIM(@Search)) + '%'
                                          ELSE NULL END;

    SELECT
        ks.SourceId,
        ks.ChatbotId,
        ks.BusinessId,
        ks.SourceType,
        ks.Title,
        ks.SourceUri,
        ks.FileName,
        ks.FileSizeBytes,
        ks.FaqQuestion,
        ks.FaqAnswer,
        ks.Status,
        ks.ErrorMessage,
        ks.ChunkCount,
        ks.TotalTokens,
        ks.LastIndexedOn,
        ks.CreatedOn,
        ks.UpdatedOn
    FROM dbo.KnowledgeSources ks
    WHERE ks.ChatbotId = @ChatbotId
      AND ks.BusinessId = @BusinessId
      AND (@SourceType IS NULL OR @SourceType = '' OR @SourceType = 'All' OR ks.SourceType = @SourceType)
      AND (@Status IS NULL OR @Status = '' OR @Status = 'All' OR ks.Status = @Status)
      AND (
          @Pattern IS NULL
          OR ks.Title LIKE @Pattern
          OR COALESCE(ks.SourceUri, '') LIKE @Pattern
          OR COALESCE(ks.FileName, '') LIKE @Pattern
          OR COALESCE(ks.FaqQuestion, '') LIKE @Pattern
      )
    ORDER BY ks.CreatedOn DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;

    SELECT COUNT(1) AS TotalCount
    FROM dbo.KnowledgeSources ks
    WHERE ks.ChatbotId = @ChatbotId
      AND ks.BusinessId = @BusinessId
      AND (@SourceType IS NULL OR @SourceType = '' OR @SourceType = 'All' OR ks.SourceType = @SourceType)
      AND (@Status IS NULL OR @Status = '' OR @Status = 'All' OR ks.Status = @Status)
      AND (
          @Pattern IS NULL
          OR ks.Title LIKE @Pattern
          OR COALESCE(ks.SourceUri, '') LIKE @Pattern
          OR COALESCE(ks.FileName, '') LIKE @Pattern
          OR COALESCE(ks.FaqQuestion, '') LIKE @Pattern
      );
END
GO

-- 2. Get Knowledge Source Detail + Chunks (Tenant-Isolated)
CREATE OR ALTER PROCEDURE dbo.usp_KnowledgeSources_GetById
    @SourceId   INT,
    @ChatbotId  INT,
    @BusinessId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        ks.SourceId,
        ks.ChatbotId,
        ks.BusinessId,
        ks.SourceType,
        ks.Title,
        ks.SourceUri,
        ks.FileName,
        ks.FileSizeBytes,
        ks.RawText,
        ks.FaqQuestion,
        ks.FaqAnswer,
        ks.Status,
        ks.ErrorMessage,
        ks.ChunkCount,
        ks.TotalTokens,
        ks.LastIndexedOn,
        ks.CreatedOn,
        ks.UpdatedOn
    FROM dbo.KnowledgeSources ks
    WHERE ks.SourceId = @SourceId
      AND ks.ChatbotId = @ChatbotId
      AND ks.BusinessId = @BusinessId;

    SELECT
        kc.ChunkId,
        kc.SourceId,
        kc.ChatbotId,
        kc.BusinessId,
        kc.ChunkIndex,
        kc.Content,
        kc.TokenCount,
        kc.CreatedOn
    FROM dbo.KnowledgeChunks kc
    WHERE kc.SourceId = @SourceId
      AND kc.ChatbotId = @ChatbotId
      AND kc.BusinessId = @BusinessId
    ORDER BY kc.ChunkIndex ASC;
END
GO

-- 3. Create Knowledge Source (Tenant-Isolated, Verifies Chatbot Ownership)
CREATE OR ALTER PROCEDURE dbo.usp_KnowledgeSources_Create
    @ChatbotId     INT,
    @BusinessId    INT,
    @SourceType    NVARCHAR(30),
    @Title         NVARCHAR(255),
    @SourceUri     NVARCHAR(1000) = NULL,
    @FileName      NVARCHAR(255) = NULL,
    @FileSizeBytes BIGINT = NULL,
    @RawText       NVARCHAR(MAX) = NULL,
    @FaqQuestion   NVARCHAR(500) = NULL,
    @FaqAnswer     NVARCHAR(MAX) = NULL,
    @Status        NVARCHAR(30) = 'Processing'
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Chatbots WHERE ChatbotId = @ChatbotId AND BusinessId = @BusinessId)
    BEGIN
        RAISERROR('CHATBOT_NOT_FOUND', 16, 1);
        RETURN;
    END

    INSERT INTO dbo.KnowledgeSources (
        ChatbotId, BusinessId, SourceType, Title, SourceUri, FileName, FileSizeBytes,
        RawText, FaqQuestion, FaqAnswer, Status
    )
    VALUES (
        @ChatbotId, @BusinessId, @SourceType, @Title, @SourceUri, @FileName, @FileSizeBytes,
        @RawText, @FaqQuestion, @FaqAnswer, @Status
    );

    SELECT CAST(SCOPE_IDENTITY() AS INT) AS SourceId;
END
GO

-- 4. Update FAQ or Manual Knowledge Source
CREATE OR ALTER PROCEDURE dbo.usp_KnowledgeSources_UpdateContent
    @SourceId    INT,
    @ChatbotId   INT,
    @BusinessId  INT,
    @Title       NVARCHAR(255),
    @RawText     NVARCHAR(MAX),
    @FaqQuestion NVARCHAR(500) = NULL,
    @FaqAnswer   NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.KnowledgeSources
    SET Title       = @Title,
        RawText     = @RawText,
        FaqQuestion = @FaqQuestion,
        FaqAnswer   = @FaqAnswer,
        Status      = 'Processing',
        ErrorMessage = NULL,
        UpdatedOn   = SYSUTCDATETIME()
    WHERE SourceId = @SourceId
      AND ChatbotId = @ChatbotId
      AND BusinessId = @BusinessId;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

-- 5. Update Knowledge Source Processing Status & Telemetry
CREATE OR ALTER PROCEDURE dbo.usp_KnowledgeSources_SetStatus
    @SourceId     INT,
    @BusinessId   INT,
    @Status       NVARCHAR(30),
    @ErrorMessage NVARCHAR(1000) = NULL,
    @ChunkCount   INT = 0,
    @TotalTokens  INT = 0
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.KnowledgeSources
    SET Status        = @Status,
        ErrorMessage  = @ErrorMessage,
        ChunkCount    = @ChunkCount,
        TotalTokens   = @TotalTokens,
        LastIndexedOn = CASE WHEN @Status = 'Indexed' THEN SYSUTCDATETIME() ELSE LastIndexedOn END,
        UpdatedOn     = SYSUTCDATETIME()
    WHERE SourceId = @SourceId
      AND BusinessId = @BusinessId;
END
GO

-- 6. Delete Knowledge Chunks for Source (used before Re-index or Delete)
CREATE OR ALTER PROCEDURE dbo.usp_KnowledgeChunks_DeleteBySource
    @SourceId   INT,
    @BusinessId INT
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.KnowledgeChunks
    WHERE SourceId = @SourceId
      AND BusinessId = @BusinessId;
END
GO

-- 7. Insert Knowledge Chunk with Embedding Vector JSON
CREATE OR ALTER PROCEDURE dbo.usp_KnowledgeChunks_Insert
    @SourceId      INT,
    @ChatbotId     INT,
    @BusinessId    INT,
    @ChunkIndex    INT,
    @Content       NVARCHAR(MAX),
    @EmbeddingJson NVARCHAR(MAX),
    @TokenCount    INT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.KnowledgeChunks (
        SourceId, ChatbotId, BusinessId, ChunkIndex, Content, EmbeddingJson, TokenCount
    )
    VALUES (
        @SourceId, @ChatbotId, @BusinessId, @ChunkIndex, @Content, @EmbeddingJson, @TokenCount
    );
END
GO

-- 8. List Indexed Chunks for Vector Similarity Retrieval (Strict Chatbot & Tenant Isolation)
CREATE OR ALTER PROCEDURE dbo.usp_KnowledgeChunks_ListForRetrieval
    @ChatbotId  INT,
    @BusinessId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        kc.ChunkId,
        kc.SourceId,
        kc.ChunkIndex,
        kc.Content,
        kc.EmbeddingJson,
        kc.TokenCount,
        ks.Title AS SourceTitle,
        ks.SourceType,
        ks.SourceUri
    FROM dbo.KnowledgeChunks kc
    INNER JOIN dbo.KnowledgeSources ks ON ks.SourceId = kc.SourceId
    WHERE kc.ChatbotId = @ChatbotId
      AND kc.BusinessId = @BusinessId
      AND ks.BusinessId = @BusinessId
      AND ks.Status = 'Indexed'
      AND kc.EmbeddingJson IS NOT NULL
    ORDER BY kc.SourceId ASC, kc.ChunkIndex ASC;
END
GO

-- 9. Delete Knowledge Source & Cascading Chunks (Tenant-Isolated)
CREATE OR ALTER PROCEDURE dbo.usp_KnowledgeSources_Delete
    @SourceId   INT,
    @ChatbotId  INT,
    @BusinessId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.KnowledgeSources
        WHERE SourceId = @SourceId AND ChatbotId = @ChatbotId AND BusinessId = @BusinessId
    )
    BEGIN
        SELECT 0 AS DeletedCount;
        RETURN;
    END

    BEGIN TRAN;
        DELETE FROM dbo.KnowledgeChunks
        WHERE SourceId = @SourceId AND ChatbotId = @ChatbotId AND BusinessId = @BusinessId;

        DELETE FROM dbo.KnowledgeSources
        WHERE SourceId = @SourceId AND ChatbotId = @ChatbotId AND BusinessId = @BusinessId;
    COMMIT TRAN;

    SELECT 1 AS DeletedCount;
END
GO

-- 10. Knowledge Stats Summary for Chatbot
CREATE OR ALTER PROCEDURE dbo.usp_KnowledgeStats_ByChatbot
    @ChatbotId  INT,
    @BusinessId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        COUNT(1) AS TotalSources,
        SUM(CASE WHEN Status = 'Indexed' THEN 1 ELSE 0 END) AS IndexedSources,
        SUM(CASE WHEN Status IN ('Pending', 'Processing') THEN 1 ELSE 0 END) AS ProcessingSources,
        SUM(CASE WHEN Status = 'Failed' THEN 1 ELSE 0 END) AS FailedSources,
        COALESCE(SUM(CASE WHEN Status = 'Indexed' THEN ChunkCount ELSE 0 END), 0) AS TotalChunks,
        COALESCE(SUM(CASE WHEN Status = 'Indexed' THEN TotalTokens ELSE 0 END), 0) AS TotalTokens
    FROM dbo.KnowledgeSources
    WHERE ChatbotId = @ChatbotId AND BusinessId = @BusinessId;
END
GO
