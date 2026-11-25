-- ============================================================================
-- ChatPilot AI - Phase 5 Database Migration (Analytics & Conversation Indexes)
-- File: 010_Phase5_ConversationsAndAnalytics.sql
-- Safe & Idempotent: Preserves all Phase 1-4 tables and data.
-- ============================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Conversations_Business_CreatedOn' AND object_id = OBJECT_ID('dbo.Conversations')
)
BEGIN
    CREATE INDEX IX_Conversations_Business_CreatedOn
        ON dbo.Conversations(BusinessId, CreatedOn DESC, IsResolved);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Messages_Business_CreatedOn' AND object_id = OBJECT_ID('dbo.Messages')
)
BEGIN
    CREATE INDEX IX_Messages_Business_CreatedOn
        ON dbo.Messages(BusinessId, CreatedOn DESC, SenderType, IsUnanswered);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_UsageLogs_Business_CreatedOn' AND object_id = OBJECT_ID('dbo.UsageLogs')
)
BEGIN
    CREATE INDEX IX_UsageLogs_Business_CreatedOn
        ON dbo.UsageLogs(BusinessId, CreatedOn DESC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_UsageLogs_CreatedOn' AND object_id = OBJECT_ID('dbo.UsageLogs')
)
BEGIN
    CREATE INDEX IX_UsageLogs_CreatedOn
        ON dbo.UsageLogs(CreatedOn DESC, ModelName);
END
GO
