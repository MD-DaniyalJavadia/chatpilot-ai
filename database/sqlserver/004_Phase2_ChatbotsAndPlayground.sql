-- ============================================================================
-- ChatPilot AI - Phase 2 Database Migration (Chatbots, Settings & AI Providers)
-- File: 004_Phase2_ChatbotsAndPlayground.sql
-- Safe & Idempotent: Preserves all Phase 1 tables and existing data.
-- ============================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Create AIProviders table (Modular AI provider registry)
IF OBJECT_ID('dbo.AIProviders', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AIProviders (
        ProviderId          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Code                NVARCHAR(50) NOT NULL UNIQUE,
        Name                NVARCHAR(100) NOT NULL,
        SupportedModelsJson NVARCHAR(MAX) NOT NULL,
        IsActive            BIT NOT NULL CONSTRAINT DF_AIProviders_IsActive DEFAULT (1),
        CreatedOn           DATETIME2(3) NOT NULL CONSTRAINT DF_AIProviders_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn           DATETIME2(3) NOT NULL CONSTRAINT DF_AIProviders_UpdatedOn DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Seed Google Gemini Provider with current supported models
MERGE dbo.AIProviders AS target
USING (VALUES
    (
        'GOOGLE_GEMINI',
        'Google Gemini',
        N'[{"id":"gemini-4-hydrogen","label":"Gemini 4 Hydrogen (Balanced)","tier":"standard"},{"id":"gemini-3.1-flash-lite","label":"Gemini 3.1 Flash Lite (Fast)","tier":"standard"},{"id":"gemini-4-neon","label":"Gemini 4 Neon (Advanced Reasoning)","tier":"paid"},{"id":"gemini-4-carbon","label":"Gemini 4 Carbon (Deep Reasoning)","tier":"paid"}]'
    )
) AS src(Code, Name, SupportedModelsJson)
ON target.Code = src.Code
WHEN MATCHED THEN
    UPDATE SET Name = src.Name, SupportedModelsJson = src.SupportedModelsJson, UpdatedOn = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (Code, Name, SupportedModelsJson, IsActive)
    VALUES (src.Code, src.Name, src.SupportedModelsJson, 1);
GO

-- 2. Extend dbo.Chatbots with BusinessName and WebsiteUrl if missing
IF COL_LENGTH('dbo.Chatbots', 'BusinessName') IS NULL
BEGIN
    ALTER TABLE dbo.Chatbots ADD BusinessName NVARCHAR(200) NOT NULL CONSTRAINT DF_Chatbots_BusinessName DEFAULT ('');
END
GO

IF COL_LENGTH('dbo.Chatbots', 'WebsiteUrl') IS NULL
BEGIN
    ALTER TABLE dbo.Chatbots ADD WebsiteUrl NVARCHAR(500) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Chatbots_BusinessId_IsEnabled' AND object_id = OBJECT_ID('dbo.Chatbots'))
BEGIN
    CREATE INDEX IX_Chatbots_BusinessId_IsEnabled ON dbo.Chatbots(BusinessId, IsEnabled);
END
GO

-- 3. Extend dbo.ChatbotSettings with Phase 2 AI, Response, and Behavior configuration fields
IF COL_LENGTH('dbo.ChatbotSettings', 'AiProvider') IS NULL
BEGIN
    ALTER TABLE dbo.ChatbotSettings ADD AiProvider NVARCHAR(50) NOT NULL CONSTRAINT DF_CS_AiProvider DEFAULT ('GOOGLE_GEMINI');
END
GO

IF COL_LENGTH('dbo.ChatbotSettings', 'Temperature') IS NULL
BEGIN
    ALTER TABLE dbo.ChatbotSettings ADD Temperature DECIMAL(3,2) NOT NULL CONSTRAINT DF_CS_Temperature DEFAULT (0.70);
END
GO

IF COL_LENGTH('dbo.ChatbotSettings', 'MaxOutputTokens') IS NULL
BEGIN
    ALTER TABLE dbo.ChatbotSettings ADD MaxOutputTokens INT NOT NULL CONSTRAINT DF_CS_MaxOutputTokens DEFAULT (2048);
END
GO

IF COL_LENGTH('dbo.ChatbotSettings', 'FallbackMessage') IS NULL
BEGIN
    ALTER TABLE dbo.ChatbotSettings ADD FallbackMessage NVARCHAR(500) NULL;
END
GO

IF COL_LENGTH('dbo.ChatbotSettings', 'EnableConversationHistory') IS NULL
BEGIN
    ALTER TABLE dbo.ChatbotSettings ADD EnableConversationHistory BIT NOT NULL CONSTRAINT DF_CS_History DEFAULT (1);
END
GO

IF COL_LENGTH('dbo.ChatbotSettings', 'EnableHumanHandover') IS NULL
BEGIN
    ALTER TABLE dbo.ChatbotSettings ADD EnableHumanHandover BIT NOT NULL CONSTRAINT DF_CS_Handover DEFAULT (0);
END
GO

IF COL_LENGTH('dbo.ChatbotSettings', 'EnableFollowUpQuestions') IS NULL
BEGIN
    ALTER TABLE dbo.ChatbotSettings ADD EnableFollowUpQuestions BIT NOT NULL CONSTRAINT DF_CS_FollowUp DEFAULT (1);
END
GO
