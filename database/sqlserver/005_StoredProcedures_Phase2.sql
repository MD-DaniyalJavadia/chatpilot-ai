-- ============================================================================
-- ChatPilot AI - Phase 2 Stored Procedures (Chatbots, Configuration, Usage)
-- File: 005_StoredProcedures_Phase2.sql
-- ============================================================================

-- 1. List Active AI Providers
CREATE OR ALTER PROCEDURE dbo.usp_AIProviders_ListActive
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ProviderId, Code, Name, SupportedModelsJson, IsActive
    FROM dbo.AIProviders
    WHERE IsActive = 1
    ORDER BY ProviderId ASC;
END
GO

-- 2. Create Chatbot + Default/Initial Settings (Enforces Subscription MaxChatbots)
CREATE OR ALTER PROCEDURE dbo.usp_Chatbots_Create
    @BusinessId                INT,
    @PublicId                  NVARCHAR(64),
    @Name                      NVARCHAR(150),
    @Description               NVARCHAR(500) = NULL,
    @BusinessName              NVARCHAR(200),
    @WebsiteUrl                NVARCHAR(500) = NULL,
    @AiProvider                NVARCHAR(50),
    @AiModel                   NVARCHAR(100),
    @SystemInstructions        NVARCHAR(MAX) = NULL,
    @WelcomeMessage            NVARCHAR(500) = NULL,
    @FallbackMessage           NVARCHAR(500) = NULL,
    @Personality               NVARCHAR(100) = NULL,
    @ResponseLanguage          NVARCHAR(50) = 'English',
    @ResponseTone              NVARCHAR(50) = 'Professional',
    @Temperature               DECIMAL(3,2) = 0.70,
    @MaxOutputTokens           INT = 2048,
    @EnableConversationHistory BIT = 1,
    @EnableHumanHandover       BIT = 0,
    @EnableFollowUpQuestions   BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;
        DECLARE @MaxChatbots INT = COALESCE((
            SELECT TOP 1 sp.MaxChatbots
            FROM dbo.Subscriptions s
            INNER JOIN dbo.SubscriptionPlans sp ON sp.PlanId = s.PlanId
            WHERE s.BusinessId = @BusinessId AND s.Status = 'Active'
            ORDER BY s.SubscriptionId DESC
        ), 1);

        DECLARE @CurrentCount INT = (SELECT COUNT(1) FROM dbo.Chatbots WHERE BusinessId = @BusinessId);
        IF @CurrentCount >= @MaxChatbots
        BEGIN
            ROLLBACK TRAN;
            RAISERROR('Subscription chatbot limit reached.', 16, 1);
            RETURN;
        END

        INSERT INTO dbo.Chatbots (BusinessId, PublicId, Name, Description, BusinessName, WebsiteUrl, IsEnabled)
        VALUES (@BusinessId, @PublicId, @Name, @Description, @BusinessName, @WebsiteUrl, 1);

        DECLARE @ChatbotId INT = SCOPE_IDENTITY();

        INSERT INTO dbo.ChatbotSettings (
            ChatbotId, AiProvider, AiModel, SystemInstructions, WelcomeMessage, FallbackMessage,
            Personality, ResponseLanguage, ResponseTone, Temperature, MaxOutputTokens,
            EnableConversationHistory, EnableHumanHandover, EnableFollowUpQuestions
        )
        VALUES (
            @ChatbotId, @AiProvider, @AiModel, @SystemInstructions, @WelcomeMessage, @FallbackMessage,
            @Personality, @ResponseLanguage, @ResponseTone, @Temperature, @MaxOutputTokens,
            @EnableConversationHistory, @EnableHumanHandover, @EnableFollowUpQuestions
        );

        SELECT @ChatbotId AS ChatbotId;
    COMMIT TRAN;
END
GO

-- 3. List Chatbots for a Business (Search, Status Filter, Pagination)
CREATE OR ALTER PROCEDURE dbo.usp_Chatbots_ListByBusiness
    @BusinessId INT,
    @Search     NVARCHAR(200) = NULL,
    @IsEnabled  BIT = NULL,
    @Page       INT = 1,
    @PageSize   INT = 10
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        c.ChatbotId,
        c.BusinessId,
        c.PublicId,
        c.Name,
        c.Description,
        c.BusinessName,
        c.WebsiteUrl,
        c.IsEnabled,
        c.CreatedOn,
        c.UpdatedOn,
        cs.AiProvider,
        cs.AiModel,
        cs.ResponseLanguage,
        cs.ResponseTone
    FROM dbo.Chatbots c
    INNER JOIN dbo.ChatbotSettings cs ON cs.ChatbotId = c.ChatbotId
    WHERE c.BusinessId = @BusinessId
      AND (@IsEnabled IS NULL OR c.IsEnabled = @IsEnabled)
      AND (@Search IS NULL OR c.Name LIKE '%' + @Search + '%' OR c.Description LIKE '%' + @Search + '%')
    ORDER BY c.CreatedOn DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;

    SELECT COUNT(1) AS TotalCount
    FROM dbo.Chatbots c
    WHERE c.BusinessId = @BusinessId
      AND (@IsEnabled IS NULL OR c.IsEnabled = @IsEnabled)
      AND (@Search IS NULL OR c.Name LIKE '%' + @Search + '%' OR c.Description LIKE '%' + @Search + '%');
END
GO

-- 4. Get Chatbot Full Detail & Configuration (Tenant Scoped)
CREATE OR ALTER PROCEDURE dbo.usp_Chatbots_GetById
    @ChatbotId  INT,
    @BusinessId INT
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
        c.CreatedOn,
        c.UpdatedOn,
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
        cs.EnableConversationHistory,
        cs.EnableHumanHandover,
        cs.EnableFollowUpQuestions
    FROM dbo.Chatbots c
    INNER JOIN dbo.ChatbotSettings cs ON cs.ChatbotId = c.ChatbotId
    WHERE c.ChatbotId = @ChatbotId AND c.BusinessId = @BusinessId;
END
GO

-- 5. Update Chatbot Details & Configuration (Tenant Scoped)
CREATE OR ALTER PROCEDURE dbo.usp_Chatbots_UpdateConfiguration
    @ChatbotId                 INT,
    @BusinessId                INT,
    @Name                      NVARCHAR(150),
    @Description               NVARCHAR(500) = NULL,
    @BusinessName              NVARCHAR(200),
    @WebsiteUrl                NVARCHAR(500) = NULL,
    @IsEnabled                 BIT,
    @AiProvider                NVARCHAR(50),
    @AiModel                   NVARCHAR(100),
    @SystemInstructions        NVARCHAR(MAX) = NULL,
    @WelcomeMessage            NVARCHAR(500) = NULL,
    @FallbackMessage           NVARCHAR(500) = NULL,
    @Personality               NVARCHAR(100) = NULL,
    @ResponseLanguage          NVARCHAR(50),
    @ResponseTone              NVARCHAR(50),
    @Temperature               DECIMAL(3,2),
    @MaxOutputTokens           INT,
    @EnableConversationHistory BIT,
    @EnableHumanHandover       BIT,
    @EnableFollowUpQuestions   BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM dbo.Chatbots WHERE ChatbotId = @ChatbotId AND BusinessId = @BusinessId)
        BEGIN
            ROLLBACK TRAN;
            RAISERROR('Chatbot not found for this business.', 16, 1);
            RETURN;
        END

        UPDATE dbo.Chatbots
        SET Name = @Name,
            Description = @Description,
            BusinessName = @BusinessName,
            WebsiteUrl = @WebsiteUrl,
            IsEnabled = @IsEnabled,
            UpdatedOn = SYSUTCDATETIME()
        WHERE ChatbotId = @ChatbotId AND BusinessId = @BusinessId;

        UPDATE dbo.ChatbotSettings
        SET AiProvider = @AiProvider,
            AiModel = @AiModel,
            SystemInstructions = @SystemInstructions,
            WelcomeMessage = @WelcomeMessage,
            FallbackMessage = @FallbackMessage,
            Personality = @Personality,
            ResponseLanguage = @ResponseLanguage,
            ResponseTone = @ResponseTone,
            Temperature = @Temperature,
            MaxOutputTokens = @MaxOutputTokens,
            EnableConversationHistory = @EnableConversationHistory,
            EnableHumanHandover = @EnableHumanHandover,
            EnableFollowUpQuestions = @EnableFollowUpQuestions,
            UpdatedOn = SYSUTCDATETIME()
        WHERE ChatbotId = @ChatbotId;
    COMMIT TRAN;
END
GO

-- 6. Toggle Chatbot Enabled Status (Tenant Scoped)
CREATE OR ALTER PROCEDURE dbo.usp_Chatbots_SetEnabled
    @ChatbotId  INT,
    @BusinessId INT,
    @IsEnabled  BIT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Chatbots
    SET IsEnabled = @IsEnabled, UpdatedOn = SYSUTCDATETIME()
    WHERE ChatbotId = @ChatbotId AND BusinessId = @BusinessId;

    SELECT @@ROWCOUNT AS AffectedRows;
END
GO

-- 7. Delete Chatbot (Tenant Scoped)
CREATE OR ALTER PROCEDURE dbo.usp_Chatbots_Delete
    @ChatbotId  INT,
    @BusinessId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM dbo.Chatbots WHERE ChatbotId = @ChatbotId AND BusinessId = @BusinessId)
        BEGIN
            ROLLBACK TRAN;
            SELECT 0 AS AffectedRows;
            RETURN;
        END

        DELETE FROM dbo.UsageLogs WHERE ChatbotId = @ChatbotId AND BusinessId = @BusinessId;
        DELETE FROM dbo.ChatbotSettings WHERE ChatbotId = @ChatbotId;
        DELETE FROM dbo.Chatbots WHERE ChatbotId = @ChatbotId AND BusinessId = @BusinessId;

        SELECT 1 AS AffectedRows;
    COMMIT TRAN;
END
GO

-- 8. Record AI Token Usage
CREATE OR ALTER PROCEDURE dbo.usp_UsageLogs_Insert
    @BusinessId   INT,
    @ChatbotId    INT = NULL,
    @TokensUsed   INT,
    @MessageCount INT,
    @ModelName    NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.UsageLogs (BusinessId, ChatbotId, TokensUsed, MessageCount, ModelName)
    VALUES (@BusinessId, @ChatbotId, @TokensUsed, @MessageCount, @ModelName);
END
GO
