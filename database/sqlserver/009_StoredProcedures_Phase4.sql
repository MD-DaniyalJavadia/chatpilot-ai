-- ============================================================================
-- ChatPilot AI - Phase 4 Stored Procedures (Widget & Domain Allowlisting)
-- File: 009_StoredProcedures_Phase4.sql
-- ============================================================================

-- 1. List Allowed Domains by Chatbot (Tenant Scoped)
CREATE OR ALTER PROCEDURE dbo.usp_AllowedDomains_ListByChatbot
    @ChatbotId  INT,
    @BusinessId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        ad.AllowedDomainId,
        ad.ChatbotId,
        ad.BusinessId,
        ad.Domain,
        ad.CreatedOn,
        ad.UpdatedOn
    FROM dbo.AllowedDomains ad
    INNER JOIN dbo.Chatbots c ON c.ChatbotId = ad.ChatbotId
    WHERE ad.ChatbotId = @ChatbotId
      AND ad.BusinessId = @BusinessId
      AND c.BusinessId = @BusinessId
    ORDER BY ad.CreatedOn DESC;
END
GO

-- 2. Add Allowed Domain (Tenant Scoped, Duplicate Safe)
CREATE OR ALTER PROCEDURE dbo.usp_AllowedDomains_Add
    @ChatbotId  INT,
    @BusinessId INT,
    @Domain     NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Chatbots WHERE ChatbotId = @ChatbotId AND BusinessId = @BusinessId)
    BEGIN
        RAISERROR('Chatbot not found for this business.', 16, 1);
        RETURN;
    END

    IF EXISTS (SELECT 1 FROM dbo.AllowedDomains WHERE ChatbotId = @ChatbotId AND Domain = @Domain)
    BEGIN
        RAISERROR('Domain is already allowlisted for this chatbot.', 16, 1);
        RETURN;
    END

    INSERT INTO dbo.AllowedDomains (ChatbotId, BusinessId, Domain)
    VALUES (@ChatbotId, @BusinessId, @Domain);

    SELECT
        AllowedDomainId,
        ChatbotId,
        BusinessId,
        Domain,
        CreatedOn,
        UpdatedOn
    FROM dbo.AllowedDomains
    WHERE AllowedDomainId = SCOPE_IDENTITY();
END
GO

-- 3. Delete Allowed Domain (Tenant Scoped)
CREATE OR ALTER PROCEDURE dbo.usp_AllowedDomains_Delete
    @AllowedDomainId INT,
    @ChatbotId       INT,
    @BusinessId      INT
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.AllowedDomains
    WHERE AllowedDomainId = @AllowedDomainId
      AND ChatbotId = @ChatbotId
      AND BusinessId = @BusinessId;

    SELECT @@ROWCOUNT AS AffectedRows;
END
GO

-- 4. Update Widget Appearance & Handover Branding (Tenant Scoped)
CREATE OR ALTER PROCEDURE dbo.usp_ChatbotSettings_UpdateWidgetAppearance
    @ChatbotId          INT,
    @BusinessId         INT,
    @BrandColor         NVARCHAR(20),
    @LogoUrl            NVARCHAR(500) = NULL,
    @HumanHandoverEmail NVARCHAR(256) = NULL,
    @WidgetPosition     NVARCHAR(20),
    @WidgetTitle        NVARCHAR(100) = NULL,
    @WidgetSubtitle     NVARCHAR(180) = NULL,
    @LauncherLabel      NVARCHAR(60) = NULL,
    @ShowCitations      BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Chatbots WHERE ChatbotId = @ChatbotId AND BusinessId = @BusinessId)
    BEGIN
        RAISERROR('Chatbot not found for this business.', 16, 1);
        RETURN;
    END

    UPDATE dbo.ChatbotSettings
    SET BrandColor         = @BrandColor,
        LogoUrl            = @LogoUrl,
        HumanHandoverEmail = @HumanHandoverEmail,
        WidgetPosition     = @WidgetPosition,
        WidgetTitle        = @WidgetTitle,
        WidgetSubtitle     = @WidgetSubtitle,
        LauncherLabel      = @LauncherLabel,
        ShowCitations      = @ShowCitations,
        UpdatedOn          = SYSUTCDATETIME()
    WHERE ChatbotId = @ChatbotId;
END
GO

-- 5. Public Widget Config Lookup by PublicId
CREATE OR ALTER PROCEDURE dbo.usp_Widget_GetConfigByPublicId
    @PublicId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP 1
        c.ChatbotId,
        c.BusinessId,
        c.PublicId,
        c.Name,
        c.Description,
        c.BusinessName,
        c.WebsiteUrl,
        c.IsEnabled,
        b.Status AS BusinessStatus,
        cs.AiProvider,
        cs.AiModel,
        cs.SystemInstructions,
        cs.WelcomeMessage,
        cs.FallbackMessage,
        cs.Personality,
        cs.ResponseLanguage,
        cs.ResponseTone,
        cs.Temperature,
        cs.MaxOutputTokens,
        cs.BrandColor,
        cs.LogoUrl,
        cs.HumanHandoverEmail,
        cs.WidgetPosition,
        cs.WidgetTitle,
        cs.WidgetSubtitle,
        cs.LauncherLabel,
        cs.ShowCitations,
        cs.EnableConversationHistory,
        cs.EnableHumanHandover,
        cs.EnableFollowUpQuestions
    FROM dbo.Chatbots c
    INNER JOIN dbo.Businesses b ON b.BusinessId = c.BusinessId
    INNER JOIN dbo.ChatbotSettings cs ON cs.ChatbotId = c.ChatbotId
    WHERE c.PublicId = @PublicId;

    SELECT ad.Domain
    FROM dbo.AllowedDomains ad
    INNER JOIN dbo.Chatbots c ON c.ChatbotId = ad.ChatbotId
    WHERE c.PublicId = @PublicId;
END
GO

-- 6. Check Monthly Plan Message Quota for Public Widget Traffic
CREATE OR ALTER PROCEDURE dbo.usp_Widget_CheckMonthlyQuota
    @BusinessId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MaxMonthlyMessages INT = COALESCE((
        SELECT TOP 1 sp.MaxMonthlyMessages
        FROM dbo.Subscriptions s
        INNER JOIN dbo.SubscriptionPlans sp ON sp.PlanId = s.PlanId
        WHERE s.BusinessId = @BusinessId AND s.Status = 'Active'
        ORDER BY s.SubscriptionId DESC
    ), 250);

    DECLARE @MonthStart DATETIME2(3) = DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1);

    DECLARE @UsedThisMonth INT = (
        SELECT COUNT(1)
        FROM dbo.Messages m
        WHERE m.BusinessId = @BusinessId
          AND m.SenderType = 'User'
          AND m.CreatedOn >= @MonthStart
    );

    SELECT @MaxMonthlyMessages AS MaxMonthlyMessages, @UsedThisMonth AS UsedThisMonth;
END
GO

-- 7. Get or Create Visitor Conversation
CREATE OR ALTER PROCEDURE dbo.usp_Widget_GetOrCreateConversation
    @ChatbotId      INT,
    @BusinessId     INT,
    @VisitorSession NVARCHAR(128),
    @VisitorDomain  NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ConversationId INT = (
        SELECT TOP 1 ConversationId
        FROM dbo.Conversations
        WHERE ChatbotId = @ChatbotId
          AND BusinessId = @BusinessId
          AND VisitorSession = @VisitorSession
        ORDER BY ConversationId DESC
    );

    IF @ConversationId IS NULL
    BEGIN
        INSERT INTO dbo.Conversations (ChatbotId, BusinessId, VisitorSession, VisitorDomain, IsResolved)
        VALUES (@ChatbotId, @BusinessId, @VisitorSession, @VisitorDomain, 0);

        SET @ConversationId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.Conversations
        SET VisitorDomain = COALESCE(@VisitorDomain, VisitorDomain),
            UpdatedOn     = SYSUTCDATETIME()
        WHERE ConversationId = @ConversationId;
    END

    SELECT @ConversationId AS ConversationId;
END
GO

-- 8. List Recent Messages for Visitor Session
CREATE OR ALTER PROCEDURE dbo.usp_Widget_ListMessagesBySession
    @ChatbotId      INT,
    @VisitorSession NVARCHAR(128),
    @MaxMessages    INT = 30
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@MaxMessages)
        m.MessageId,
        m.SenderType,
        m.Content,
        m.IsUnanswered,
        m.CreatedOn
    FROM dbo.Messages m
    INNER JOIN dbo.Conversations c ON c.ConversationId = m.ConversationId
    WHERE c.ChatbotId = @ChatbotId
      AND c.VisitorSession = @VisitorSession
    ORDER BY m.MessageId ASC;
END
GO

-- 9. Persist Visitor + Assistant Turn + UsageLog Atomically
CREATE OR ALTER PROCEDURE dbo.usp_Widget_InsertConversationTurn
    @ConversationId INT,
    @BusinessId     INT,
    @ChatbotId      INT,
    @UserContent    NVARCHAR(MAX),
    @BotContent     NVARCHAR(MAX),
    @TokensUsed     INT,
    @IsUnanswered   BIT,
    @ModelName      NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;
        INSERT INTO dbo.Messages (ConversationId, BusinessId, SenderType, Content, TokensUsed, IsUnanswered)
        VALUES (@ConversationId, @BusinessId, 'User', @UserContent, 0, 0);

        INSERT INTO dbo.Messages (ConversationId, BusinessId, SenderType, Content, TokensUsed, IsUnanswered)
        VALUES (@ConversationId, @BusinessId, 'Assistant', @BotContent, @TokensUsed, @IsUnanswered);

        UPDATE dbo.Conversations
        SET UpdatedOn = SYSUTCDATETIME()
        WHERE ConversationId = @ConversationId AND BusinessId = @BusinessId;

        INSERT INTO dbo.UsageLogs (BusinessId, ChatbotId, TokensUsed, MessageCount, ModelName)
        VALUES (@BusinessId, @ChatbotId, @TokensUsed, 1, @ModelName);
    COMMIT TRAN;
END
GO
