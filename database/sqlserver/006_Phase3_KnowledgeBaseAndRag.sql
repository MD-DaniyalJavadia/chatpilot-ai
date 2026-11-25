-- ============================================================================
-- ChatPilot AI - Phase 3: Knowledge Base & RAG Pipeline Schema Migration
-- File: 006_Phase3_KnowledgeBaseAndRag.sql
-- Target: Microsoft SQL Server 2019+ / Azure SQL
-- ============================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Extend dbo.KnowledgeSources for rich ingestion metadata, FAQ Q&A, and chunk telemetry
IF COL_LENGTH('dbo.KnowledgeSources', 'RawText') IS NULL
BEGIN
    ALTER TABLE dbo.KnowledgeSources ADD RawText NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('dbo.KnowledgeSources', 'FaqQuestion') IS NULL
BEGIN
    ALTER TABLE dbo.KnowledgeSources ADD FaqQuestion NVARCHAR(500) NULL;
END
GO

IF COL_LENGTH('dbo.KnowledgeSources', 'FaqAnswer') IS NULL
BEGIN
    ALTER TABLE dbo.KnowledgeSources ADD FaqAnswer NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('dbo.KnowledgeSources', 'FileName') IS NULL
BEGIN
    ALTER TABLE dbo.KnowledgeSources ADD FileName NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('dbo.KnowledgeSources', 'FileSizeBytes') IS NULL
BEGIN
    ALTER TABLE dbo.KnowledgeSources ADD FileSizeBytes BIGINT NULL;
END
GO

IF COL_LENGTH('dbo.KnowledgeSources', 'ChunkCount') IS NULL
BEGIN
    ALTER TABLE dbo.KnowledgeSources ADD ChunkCount INT NOT NULL CONSTRAINT DF_KS_ChunkCount DEFAULT (0);
END
GO

IF COL_LENGTH('dbo.KnowledgeSources', 'TotalTokens') IS NULL
BEGIN
    ALTER TABLE dbo.KnowledgeSources ADD TotalTokens INT NOT NULL CONSTRAINT DF_KS_TotalTokens DEFAULT (0);
END
GO

IF COL_LENGTH('dbo.KnowledgeSources', 'LastIndexedOn') IS NULL
BEGIN
    ALTER TABLE dbo.KnowledgeSources ADD LastIndexedOn DATETIME2(3) NULL;
END
GO

-- Enforce valid source types and processing statuses
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_KnowledgeSources_SourceType')
BEGIN
    ALTER TABLE dbo.KnowledgeSources
        ADD CONSTRAINT CK_KnowledgeSources_SourceType
        CHECK (SourceType IN ('PDF', 'DOCX', 'TXT', 'URL', 'Manual', 'FAQ'));
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_KnowledgeSources_Status')
BEGIN
    ALTER TABLE dbo.KnowledgeSources
        ADD CONSTRAINT CK_KnowledgeSources_Status
        CHECK (Status IN ('Pending', 'Processing', 'Indexed', 'Failed'));
END
GO

-- 2. Performance Indexes for Tenant & Chatbot-Scoped Vector Retrieval
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KnowledgeSources_Chatbot_Business' AND object_id = OBJECT_ID('dbo.KnowledgeSources'))
BEGIN
    CREATE INDEX IX_KnowledgeSources_Chatbot_Business
        ON dbo.KnowledgeSources(ChatbotId, BusinessId, Status, SourceType)
        INCLUDE (Title, SourceUri, ChunkCount, TotalTokens, CreatedOn, UpdatedOn);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KnowledgeChunks_Chatbot_Business' AND object_id = OBJECT_ID('dbo.KnowledgeChunks'))
BEGIN
    CREATE INDEX IX_KnowledgeChunks_Chatbot_Business
        ON dbo.KnowledgeChunks(ChatbotId, BusinessId, SourceId)
        INCLUDE (ChunkIndex, TokenCount);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KnowledgeChunks_SourceId' AND object_id = OBJECT_ID('dbo.KnowledgeChunks'))
BEGIN
    CREATE INDEX IX_KnowledgeChunks_SourceId
        ON dbo.KnowledgeChunks(SourceId, ChunkIndex);
END
GO
