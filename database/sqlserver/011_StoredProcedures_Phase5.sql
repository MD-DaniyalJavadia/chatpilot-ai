-- ============================================================================
-- ChatPilot AI - Phase 5 Stored Procedures (Conversations, Analytics, Admin Monitoring)
-- File: 011_StoredProcedures_Phase5.sql
-- ============================================================================

-- 1. Business: List Conversations with Search, Chatbot, Resolution, and Date Filters
CREATE OR ALTER PROCEDURE dbo.usp_Conversations_ListByBusiness
    @BusinessId INT,
    @ChatbotId  INT = NULL,
    @Status     NVARCHAR(20) = 'all',
    @Search     NVARCHAR(200) = NULL,
    @Page       INT = 1,
    @PageSize   INT = 15
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        conv.ConversationId,
        conv.ChatbotId,
        c.Name AS ChatbotName,
        conv.VisitorSession,
        conv.VisitorDomain,
        conv.IsResolved,
        conv.CreatedOn,
        conv.UpdatedOn,
        (SELECT COUNT(1) FROM dbo.Messages m WHERE m.ConversationId = conv.ConversationId) AS MessageCount,
        (SELECT COUNT(1) FROM dbo.Messages m WHERE m.ConversationId = conv.ConversationId AND m.IsUnanswered = 1) AS UnansweredCount,
        (SELECT COALESCE(SUM(m.TokensUsed), 0) FROM dbo.Messages m WHERE m.ConversationId = conv.ConversationId) AS TokensUsed,
        (SELECT TOP 1 m.Content FROM dbo.Messages m WHERE m.ConversationId = conv.ConversationId AND m.SenderType = 'User' ORDER BY m.MessageId ASC) AS FirstUserQuestion
    FROM dbo.Conversations conv
    INNER JOIN dbo.Chatbots c ON c.ChatbotId = conv.ChatbotId
    WHERE conv.BusinessId = @BusinessId
      AND (@ChatbotId IS NULL OR conv.ChatbotId = @ChatbotId)
      AND (
          @Status = 'all'
          OR (@Status = 'resolved' AND conv.IsResolved = 1)
          OR (@Status = 'open' AND conv.IsResolved = 0)
          OR (@Status = 'unanswered' AND EXISTS (
              SELECT 1 FROM dbo.Messages m2 WHERE m2.ConversationId = conv.ConversationId AND m2.IsUnanswered = 1
          ))
      )
      AND (
          @Search IS NULL
          OR conv.VisitorSession LIKE '%' + @Search + '%'
          OR COALESCE(conv.VisitorDomain, '') LIKE '%' + @Search + '%'
          OR EXISTS (
              SELECT 1 FROM dbo.Messages ms
              WHERE ms.ConversationId = conv.ConversationId AND ms.Content LIKE '%' + @Search + '%'
          )
      )
    ORDER BY conv.UpdatedOn DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;

    SELECT COUNT(1) AS TotalCount
    FROM dbo.Conversations conv
    WHERE conv.BusinessId = @BusinessId
      AND (@ChatbotId IS NULL OR conv.ChatbotId = @ChatbotId)
      AND (
          @Status = 'all'
          OR (@Status = 'resolved' AND conv.IsResolved = 1)
          OR (@Status = 'open' AND conv.IsResolved = 0)
          OR (@Status = 'unanswered' AND EXISTS (
              SELECT 1 FROM dbo.Messages m2 WHERE m2.ConversationId = conv.ConversationId AND m2.IsUnanswered = 1
          ))
      )
      AND (
          @Search IS NULL
          OR conv.VisitorSession LIKE '%' + @Search + '%'
          OR COALESCE(conv.VisitorDomain, '') LIKE '%' + @Search + '%'
          OR EXISTS (
              SELECT 1 FROM dbo.Messages ms
              WHERE ms.ConversationId = conv.ConversationId AND ms.Content LIKE '%' + @Search + '%'
          )
      );
END
GO

-- 2. Business: Get Single Conversation Transcript (Tenant Isolated)
CREATE OR ALTER PROCEDURE dbo.usp_Conversations_GetTranscript
    @ConversationId INT,
    @BusinessId     INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP 1
        conv.ConversationId,
        conv.ChatbotId,
        c.Name AS ChatbotName,
        conv.BusinessId,
        conv.VisitorSession,
        conv.VisitorDomain,
        conv.IsResolved,
        conv.CreatedOn,
        conv.UpdatedOn
    FROM dbo.Conversations conv
    INNER JOIN dbo.Chatbots c ON c.ChatbotId = conv.ChatbotId
    WHERE conv.ConversationId = @ConversationId AND conv.BusinessId = @BusinessId;

    SELECT
        m.MessageId,
        m.ConversationId,
        m.SenderType,
        m.Content,
        m.TokensUsed,
        m.IsUnanswered,
        m.CreatedOn
    FROM dbo.Messages m
    INNER JOIN dbo.Conversations conv ON conv.ConversationId = m.ConversationId
    WHERE m.ConversationId = @ConversationId AND conv.BusinessId = @BusinessId
    ORDER BY m.MessageId ASC;
END
GO

-- 3. Business: Toggle Conversation Resolution Status (Tenant Isolated)
CREATE OR ALTER PROCEDURE dbo.usp_Conversations_SetResolved
    @ConversationId INT,
    @BusinessId     INT,
    @IsResolved     BIT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Conversations
    SET IsResolved = @IsResolved,
        UpdatedOn  = SYSUTCDATETIME()
    WHERE ConversationId = @ConversationId AND BusinessId = @BusinessId;

    SELECT @@ROWCOUNT AS AffectedRows;
END
GO

-- 4. Business: Export Conversations Transcripts (Tenant Isolated)
CREATE OR ALTER PROCEDURE dbo.usp_Conversations_ExportByBusiness
    @BusinessId INT,
    @ChatbotId  INT = NULL,
    @Status     NVARCHAR(20) = 'all'
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        conv.ConversationId,
        c.Name AS ChatbotName,
        conv.VisitorSession,
        conv.VisitorDomain,
        conv.IsResolved,
        m.MessageId,
        m.SenderType,
        m.Content,
        m.TokensUsed,
        m.IsUnanswered,
        m.CreatedOn AS MessageTimestamp
    FROM dbo.Conversations conv
    INNER JOIN dbo.Chatbots c ON c.ChatbotId = conv.ChatbotId
    INNER JOIN dbo.Messages m ON m.ConversationId = conv.ConversationId
    WHERE conv.BusinessId = @BusinessId
      AND (@ChatbotId IS NULL OR conv.ChatbotId = @ChatbotId)
      AND (
          @Status = 'all'
          OR (@Status = 'resolved' AND conv.IsResolved = 1)
          OR (@Status = 'open' AND conv.IsResolved = 0)
      )
    ORDER BY conv.ConversationId DESC, m.MessageId ASC;
END
GO

-- 5. Business: Analytics Overview (KPIs, Daily Series, Chatbot Breakdown, Top & Unanswered Questions)
CREATE OR ALTER PROCEDURE dbo.usp_Analytics_BusinessOverview
    @BusinessId INT,
    @ChatbotId  INT = NULL,
    @Days       INT = 30
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Since DATETIME2(3) = DATEADD(DAY, -@Days, SYSUTCDATETIME());

    -- Result 1: Summary KPIs
    SELECT
        (SELECT COUNT(1) FROM dbo.Conversations conv WHERE conv.BusinessId = @BusinessId AND (@ChatbotId IS NULL OR conv.ChatbotId = @ChatbotId) AND conv.CreatedOn >= @Since) AS TotalConversations,
        (SELECT COUNT(1) FROM dbo.Conversations conv WHERE conv.BusinessId = @BusinessId AND (@ChatbotId IS NULL OR conv.ChatbotId = @ChatbotId) AND conv.CreatedOn >= @Since AND conv.IsResolved = 1) AS ResolvedConversations,
        (SELECT COUNT(1) FROM dbo.Messages m INNER JOIN dbo.Conversations conv ON conv.ConversationId = m.ConversationId WHERE m.BusinessId = @BusinessId AND (@ChatbotId IS NULL OR conv.ChatbotId = @ChatbotId) AND m.CreatedOn >= @Since) AS TotalMessages,
        (SELECT COUNT(1) FROM dbo.Messages m INNER JOIN dbo.Conversations conv ON conv.ConversationId = m.ConversationId WHERE m.BusinessId = @BusinessId AND (@ChatbotId IS NULL OR conv.ChatbotId = @ChatbotId) AND m.CreatedOn >= @Since AND m.IsUnanswered = 1) AS UnansweredMessages,
        (SELECT COALESCE(SUM(u.TokensUsed), 0) FROM dbo.UsageLogs u WHERE u.BusinessId = @BusinessId AND (@ChatbotId IS NULL OR u.ChatbotId = @ChatbotId) AND u.CreatedOn >= @Since) AS TotalTokensUsed;

    -- Result 2: Daily Conversations & Messages
    SELECT
        CONVERT(VARCHAR(10), conv.CreatedOn, 23) AS DayKey,
        COUNT(DISTINCT conv.ConversationId) AS ConversationsCount,
        COUNT(m.MessageId) AS MessagesCount
    FROM dbo.Conversations conv
    LEFT JOIN dbo.Messages m ON m.ConversationId = conv.ConversationId
    WHERE conv.BusinessId = @BusinessId
      AND (@ChatbotId IS NULL OR conv.ChatbotId = @ChatbotId)
      AND conv.CreatedOn >= @Since
    GROUP BY CONVERT(VARCHAR(10), conv.CreatedOn, 23)
    ORDER BY DayKey ASC;

    -- Result 3: Daily AI Tokens
    SELECT
        CONVERT(VARCHAR(10), u.CreatedOn, 23) AS DayKey,
        COALESCE(SUM(u.TokensUsed), 0) AS TokensUsed
    FROM dbo.UsageLogs u
    WHERE u.BusinessId = @BusinessId
      AND (@ChatbotId IS NULL OR u.ChatbotId = @ChatbotId)
      AND u.CreatedOn >= @Since
    GROUP BY CONVERT(VARCHAR(10), u.CreatedOn, 23)
    ORDER BY DayKey ASC;

    -- Result 4: Per-Chatbot Performance
    SELECT
        c.ChatbotId,
        c.Name AS ChatbotName,
        c.IsEnabled,
        COUNT(DISTINCT conv.ConversationId) AS ConversationsCount,
        (SELECT COUNT(1) FROM dbo.Messages m2 INNER JOIN dbo.Conversations c2 ON c2.ConversationId = m2.ConversationId WHERE c2.ChatbotId = c.ChatbotId AND m2.CreatedOn >= @Since) AS MessagesCount,
        (SELECT COUNT(1) FROM dbo.Messages m3 INNER JOIN dbo.Conversations c3 ON c3.ConversationId = m3.ConversationId WHERE c3.ChatbotId = c.ChatbotId AND m3.CreatedOn >= @Since AND m3.IsUnanswered = 1) AS UnansweredCount,
        (SELECT COALESCE(SUM(u2.TokensUsed), 0) FROM dbo.UsageLogs u2 WHERE u2.ChatbotId = c.ChatbotId AND u2.CreatedOn >= @Since) AS TokensUsed
    FROM dbo.Chatbots c
    LEFT JOIN dbo.Conversations conv ON conv.ChatbotId = c.ChatbotId AND conv.CreatedOn >= @Since
    WHERE c.BusinessId = @BusinessId
      AND (@ChatbotId IS NULL OR c.ChatbotId = @ChatbotId)
    GROUP BY c.ChatbotId, c.Name, c.IsEnabled
    ORDER BY ConversationsCount DESC, c.ChatbotId ASC;

    -- Result 5: Top Repeated User Questions
    SELECT TOP 8
        LEFT(LTRIM(RTRIM(m.Content)), 160) AS QuestionText,
        COUNT(1) AS AskCount,
        MAX(m.CreatedOn) AS LastAskedOn
    FROM dbo.Messages m
    INNER JOIN dbo.Conversations conv ON conv.ConversationId = m.ConversationId
    WHERE m.BusinessId = @BusinessId
      AND (@ChatbotId IS NULL OR conv.ChatbotId = @ChatbotId)
      AND m.SenderType = 'User'
      AND m.CreatedOn >= @Since
    GROUP BY LEFT(LTRIM(RTRIM(m.Content)), 160)
    ORDER BY AskCount DESC, LastAskedOn DESC;
END
GO

-- 6. Business: Usage Statistics Summary
CREATE OR ALTER PROCEDURE dbo.usp_Usage_BusinessSummary
    @BusinessId INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @MonthStart DATETIME2(3) = DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1);

    SELECT TOP 1
        COALESCE(sp.Name, 'Free') AS PlanName,
        COALESCE(sp.MaxChatbots, 1) AS MaxChatbots,
        COALESCE(sp.MaxMonthlyMessages, 250) AS MaxMonthlyMessages,
        COALESCE(sp.MaxTeamMembers, 1) AS MaxTeamMembers,
        (SELECT COUNT(1) FROM dbo.Chatbots WHERE BusinessId = @BusinessId) AS ChatbotsUsed,
        (SELECT COUNT(1) FROM dbo.BusinessUsers WHERE BusinessId = @BusinessId) AS TeamMembersUsed,
        (SELECT COUNT(1) FROM dbo.Messages WHERE BusinessId = @BusinessId AND SenderType = 'User' AND CreatedOn >= @MonthStart) AS MonthlyUserMessagesUsed,
        (SELECT COALESCE(SUM(TokensUsed), 0) FROM dbo.UsageLogs WHERE BusinessId = @BusinessId AND CreatedOn >= @MonthStart) AS MonthlyTokensUsed,
        (SELECT COUNT(1) FROM dbo.KnowledgeSources WHERE BusinessId = @BusinessId) AS KnowledgeSourcesCount,
        (SELECT COUNT(1) FROM dbo.KnowledgeChunks WHERE BusinessId = @BusinessId) AS KnowledgeChunksCount
    FROM dbo.Businesses b
    LEFT JOIN dbo.Subscriptions s ON s.BusinessId = b.BusinessId AND s.Status = 'Active'
    LEFT JOIN dbo.SubscriptionPlans sp ON sp.PlanId = s.PlanId
    WHERE b.BusinessId = @BusinessId
    ORDER BY s.SubscriptionId DESC;

    SELECT
        COALESCE(ModelName, 'unknown') AS ModelName,
        COUNT(1) AS RequestCount,
        COALESCE(SUM(MessageCount), 0) AS MessagesCount,
        COALESCE(SUM(TokensUsed), 0) AS TokensUsed
    FROM dbo.UsageLogs
    WHERE BusinessId = @BusinessId AND CreatedOn >= @MonthStart
    GROUP BY COALESCE(ModelName, 'unknown')
    ORDER BY TokensUsed DESC;
END
GO

-- 7. Super Admin: Global Chatbots List & Emergency Toggle
CREATE OR ALTER PROCEDURE dbo.usp_Admin_ListChatbots
    @Search     NVARCHAR(200) = NULL,
    @BusinessId INT = NULL,
    @IsEnabled  BIT = NULL,
    @Page       INT = 1,
    @PageSize   INT = 15
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        c.ChatbotId,
        c.BusinessId,
        b.Name AS BusinessName,
        b.Status AS BusinessStatus,
        c.PublicId,
        c.Name,
        c.IsEnabled,
        cs.AiModel,
        c.CreatedOn,
        (SELECT COUNT(1) FROM dbo.Conversations conv WHERE conv.ChatbotId = c.ChatbotId) AS ConversationCount,
        (SELECT COUNT(1) FROM dbo.KnowledgeSources ks WHERE ks.ChatbotId = c.ChatbotId AND ks.Status = 'Indexed') AS IndexedSourcesCount
    FROM dbo.Chatbots c
    INNER JOIN dbo.Businesses b ON b.BusinessId = c.BusinessId
    INNER JOIN dbo.ChatbotSettings cs ON cs.ChatbotId = c.ChatbotId
    WHERE (@BusinessId IS NULL OR c.BusinessId = @BusinessId)
      AND (@IsEnabled IS NULL OR c.IsEnabled = @IsEnabled)
      AND (@Search IS NULL OR c.Name LIKE '%' + @Search + '%' OR b.Name LIKE '%' + @Search + '%' OR c.PublicId LIKE '%' + @Search + '%')
    ORDER BY c.CreatedOn DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;

    SELECT COUNT(1) AS TotalCount
    FROM dbo.Chatbots c
    INNER JOIN dbo.Businesses b ON b.BusinessId = c.BusinessId
    WHERE (@BusinessId IS NULL OR c.BusinessId = @BusinessId)
      AND (@IsEnabled IS NULL OR c.IsEnabled = @IsEnabled)
      AND (@Search IS NULL OR c.Name LIKE '%' + @Search + '%' OR b.Name LIKE '%' + @Search + '%' OR c.PublicId LIKE '%' + @Search + '%');
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Admin_SetChatbotStatus
    @ChatbotId INT,
    @IsEnabled BIT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Chatbots
    SET IsEnabled = @IsEnabled, UpdatedOn = SYSUTCDATETIME()
    WHERE ChatbotId = @ChatbotId;
    SELECT @@ROWCOUNT AS AffectedRows;
END
GO

-- 8. Super Admin: AI Usage Monitoring
CREATE OR ALTER PROCEDURE dbo.usp_Admin_AiUsageOverview
    @Days INT = 30
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Since DATETIME2(3) = DATEADD(DAY, -@Days, SYSUTCDATETIME());

    SELECT
        CONVERT(VARCHAR(10), CreatedOn, 23) AS DayKey,
        COALESCE(SUM(TokensUsed), 0) AS TokensUsed,
        COALESCE(SUM(MessageCount), 0) AS MessagesCount,
        COUNT(1) AS ApiCallsCount
    FROM dbo.UsageLogs
    WHERE CreatedOn >= @Since
    GROUP BY CONVERT(VARCHAR(10), CreatedOn, 23)
    ORDER BY DayKey ASC;

    SELECT
        COALESCE(ModelName, 'unknown') AS ModelName,
        COUNT(1) AS ApiCallsCount,
        COALESCE(SUM(TokensUsed), 0) AS TokensUsed
    FROM dbo.UsageLogs
    WHERE CreatedOn >= @Since
    GROUP BY COALESCE(ModelName, 'unknown')
    ORDER BY TokensUsed DESC;

    SELECT TOP 15
        b.BusinessId,
        b.Name AS BusinessName,
        b.Status AS BusinessStatus,
        COALESCE(sp.Name, 'Free') AS PlanName,
        COALESCE(sp.MaxMonthlyMessages, 250) AS MaxMonthlyMessages,
        COALESCE(SUM(u.TokensUsed), 0) AS TokensUsed,
        COALESCE(SUM(u.MessageCount), 0) AS WidgetMessagesCount
    FROM dbo.Businesses b
    LEFT JOIN dbo.Subscriptions s ON s.BusinessId = b.BusinessId AND s.Status = 'Active'
    LEFT JOIN dbo.SubscriptionPlans sp ON sp.PlanId = s.PlanId
    LEFT JOIN dbo.UsageLogs u ON u.BusinessId = b.BusinessId AND u.CreatedOn >= @Since
    GROUP BY b.BusinessId, b.Name, b.Status, sp.Name, sp.MaxMonthlyMessages
    ORDER BY TokensUsed DESC, b.BusinessId ASC;
END
GO

-- 9. Super Admin: Conversation Monitoring
CREATE OR ALTER PROCEDURE dbo.usp_Admin_ListConversations
    @BusinessId INT = NULL,
    @Status     NVARCHAR(20) = 'all',
    @Search     NVARCHAR(200) = NULL,
    @Page       INT = 1,
    @PageSize   INT = 15
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        conv.ConversationId,
        conv.BusinessId,
        b.Name AS BusinessName,
        conv.ChatbotId,
        c.Name AS ChatbotName,
        conv.VisitorSession,
        conv.VisitorDomain,
        conv.IsResolved,
        conv.CreatedOn,
        conv.UpdatedOn,
        (SELECT COUNT(1) FROM dbo.Messages m WHERE m.ConversationId = conv.ConversationId) AS MessageCount,
        (SELECT COUNT(1) FROM dbo.Messages m WHERE m.ConversationId = conv.ConversationId AND m.IsUnanswered = 1) AS UnansweredCount
    FROM dbo.Conversations conv
    INNER JOIN dbo.Businesses b ON b.BusinessId = conv.BusinessId
    INNER JOIN dbo.Chatbots c ON c.ChatbotId = conv.ChatbotId
    WHERE (@BusinessId IS NULL OR conv.BusinessId = @BusinessId)
      AND (@Status = 'all' OR (@Status = 'resolved' AND conv.IsResolved = 1) OR (@Status = 'open' AND conv.IsResolved = 0))
      AND (@Search IS NULL OR b.Name LIKE '%' + @Search + '%' OR c.Name LIKE '%' + @Search + '%' OR conv.VisitorSession LIKE '%' + @Search + '%' OR COALESCE(conv.VisitorDomain, '') LIKE '%' + @Search + '%')
    ORDER BY conv.UpdatedOn DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;

    SELECT COUNT(1) AS TotalCount
    FROM dbo.Conversations conv
    INNER JOIN dbo.Businesses b ON b.BusinessId = conv.BusinessId
    INNER JOIN dbo.Chatbots c ON c.ChatbotId = conv.ChatbotId
    WHERE (@BusinessId IS NULL OR conv.BusinessId = @BusinessId)
      AND (@Status = 'all' OR (@Status = 'resolved' AND conv.IsResolved = 1) OR (@Status = 'open' AND conv.IsResolved = 0))
      AND (@Search IS NULL OR b.Name LIKE '%' + @Search + '%' OR c.Name LIKE '%' + @Search + '%' OR conv.VisitorSession LIKE '%' + @Search + '%' OR COALESCE(conv.VisitorDomain, '') LIKE '%' + @Search + '%');
END
GO
