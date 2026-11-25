-- ============================================================================
-- ChatPilot AI - Phase 4 Database Migration (Widget Appearance & Domain Allowlists)
-- File: 008_Phase4_WidgetAndDomains.sql
-- Safe & Idempotent: Preserves all Phase 1, Phase 2, and Phase 3 data.
-- ============================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Extend dbo.ChatbotSettings with Phase 4 Widget Appearance & Behavior Columns
IF COL_LENGTH('dbo.ChatbotSettings', 'WidgetPosition') IS NULL
BEGIN
    ALTER TABLE dbo.ChatbotSettings
        ADD WidgetPosition NVARCHAR(20) NOT NULL CONSTRAINT DF_CS_WidgetPosition DEFAULT ('bottom-right');
END
GO

IF COL_LENGTH('dbo.ChatbotSettings', 'WidgetTitle') IS NULL
BEGIN
    ALTER TABLE dbo.ChatbotSettings
        ADD WidgetTitle NVARCHAR(100) NULL;
END
GO

IF COL_LENGTH('dbo.ChatbotSettings', 'WidgetSubtitle') IS NULL
BEGIN
    ALTER TABLE dbo.ChatbotSettings
        ADD WidgetSubtitle NVARCHAR(180) NULL;
END
GO

IF COL_LENGTH('dbo.ChatbotSettings', 'LauncherLabel') IS NULL
BEGIN
    ALTER TABLE dbo.ChatbotSettings
        ADD LauncherLabel NVARCHAR(60) NULL;
END
GO

IF COL_LENGTH('dbo.ChatbotSettings', 'ShowCitations') IS NULL
BEGIN
    ALTER TABLE dbo.ChatbotSettings
        ADD ShowCitations BIT NOT NULL CONSTRAINT DF_CS_ShowCitations DEFAULT (1);
END
GO

-- 2. Indexes on dbo.AllowedDomains for fast CORS & tenant lookups
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_AllowedDomains_Chatbot_Domain' AND object_id = OBJECT_ID('dbo.AllowedDomains')
)
BEGIN
    CREATE UNIQUE INDEX UQ_AllowedDomains_Chatbot_Domain
        ON dbo.AllowedDomains(ChatbotId, Domain);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_AllowedDomains_BusinessId' AND object_id = OBJECT_ID('dbo.AllowedDomains')
)
BEGIN
    CREATE INDEX IX_AllowedDomains_BusinessId
        ON dbo.AllowedDomains(BusinessId, ChatbotId);
END
GO

-- 3. Indexes on dbo.Conversations & dbo.Messages for fast widget session resume & quota checks
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Conversations_Chatbot_Session' AND object_id = OBJECT_ID('dbo.Conversations')
)
BEGIN
    CREATE INDEX IX_Conversations_Chatbot_Session
        ON dbo.Conversations(ChatbotId, VisitorSession, UpdatedOn DESC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Messages_Conversation_CreatedOn' AND object_id = OBJECT_ID('dbo.Messages')
)
BEGIN
    CREATE INDEX IX_Messages_Conversation_CreatedOn
        ON dbo.Messages(ConversationId, CreatedOn ASC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Messages_Business_Sender_CreatedOn' AND object_id = OBJECT_ID('dbo.Messages')
)
BEGIN
    CREATE INDEX IX_Messages_Business_Sender_CreatedOn
        ON dbo.Messages(BusinessId, SenderType, CreatedOn DESC);
END
GO
