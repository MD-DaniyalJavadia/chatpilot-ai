-- ============================================================================
-- ChatPilot AI - Phase 6 Stored Procedures (Billing, Tickets & Settings)
-- File: 013_StoredProcedures_Phase6.sql
-- ============================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1. List Subscription Plans
CREATE OR ALTER PROCEDURE dbo.usp_Plans_List
    @IncludeInactive BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT PlanId, Code, Name, Description, MonthlyPriceUsd, YearlyPriceUsd,
           MaxChatbots, MaxMonthlyMessages, MaxTeamMembers, AllowWebsiteIngestion, IsActive,
           CreatedOn, UpdatedOn
    FROM dbo.SubscriptionPlans
    WHERE (@IncludeInactive = 1 OR IsActive = 1)
    ORDER BY MonthlyPriceUsd ASC, PlanId ASC;
END
GO

-- 2. Create Subscription Plan
CREATE OR ALTER PROCEDURE dbo.usp_Plans_Create
    @Code                  NVARCHAR(50),
    @Name                  NVARCHAR(100),
    @Description           NVARCHAR(500) = NULL,
    @MonthlyPriceUsd       DECIMAL(10,2),
    @YearlyPriceUsd        DECIMAL(10,2),
    @MaxChatbots           INT,
    @MaxMonthlyMessages    INT,
    @MaxTeamMembers        INT,
    @AllowWebsiteIngestion BIT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.SubscriptionPlans (
        Code, Name, Description, MonthlyPriceUsd, YearlyPriceUsd,
        MaxChatbots, MaxMonthlyMessages, MaxTeamMembers, AllowWebsiteIngestion, IsActive
    )
    VALUES (
        UPPER(@Code), @Name, @Description, @MonthlyPriceUsd, @YearlyPriceUsd,
        @MaxChatbots, @MaxMonthlyMessages, @MaxTeamMembers, @AllowWebsiteIngestion, 1
    );

    SELECT CAST(SCOPE_IDENTITY() AS INT) AS PlanId;
END
GO

-- 3. Update Subscription Plan
CREATE OR ALTER PROCEDURE dbo.usp_Plans_Update
    @PlanId                INT,
    @Name                  NVARCHAR(100),
    @Description           NVARCHAR(500) = NULL,
    @MonthlyPriceUsd       DECIMAL(10,2),
    @YearlyPriceUsd        DECIMAL(10,2),
    @MaxChatbots           INT,
    @MaxMonthlyMessages    INT,
    @MaxTeamMembers        INT,
    @AllowWebsiteIngestion BIT,
    @IsActive              BIT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.SubscriptionPlans
    SET Name = @Name,
        Description = @Description,
        MonthlyPriceUsd = @MonthlyPriceUsd,
        YearlyPriceUsd = @YearlyPriceUsd,
        MaxChatbots = @MaxChatbots,
        MaxMonthlyMessages = @MaxMonthlyMessages,
        MaxTeamMembers = @MaxTeamMembers,
        AllowWebsiteIngestion = @AllowWebsiteIngestion,
        IsActive = @IsActive,
        UpdatedOn = SYSUTCDATETIME()
    WHERE PlanId = @PlanId;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

-- 4. Business Subscription & Payment History
CREATE OR ALTER PROCEDURE dbo.usp_Business_GetBillingSummary
    @BusinessId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP 1
        s.SubscriptionId, s.BusinessId, s.PlanId, s.BillingCycle, s.Status, s.StartsOn, s.ExpiresOn,
        sp.Code AS PlanCode, sp.Name AS PlanName, sp.Description AS PlanDescription,
        sp.MonthlyPriceUsd, sp.YearlyPriceUsd, sp.MaxChatbots, sp.MaxMonthlyMessages,
        sp.MaxTeamMembers, sp.AllowWebsiteIngestion
    FROM dbo.Subscriptions s
    JOIN dbo.SubscriptionPlans sp ON sp.PlanId = s.PlanId
    WHERE s.BusinessId = @BusinessId
    ORDER BY CASE WHEN s.Status = 'Active' THEN 0 ELSE 1 END, s.SubscriptionId DESC;

    SELECT PaymentId, BusinessId, SubscriptionId, AmountUsd, Currency, Provider, ExternalTxnId, Status, PaidOn, CreatedOn
    FROM dbo.Payments
    WHERE BusinessId = @BusinessId
    ORDER BY CreatedOn DESC;
END
GO

-- 5. Business Switch Subscription Plan + Record Payment
CREATE OR ALTER PROCEDURE dbo.usp_Business_SwitchSubscriptionPlan
    @BusinessId    INT,
    @PlanId        INT,
    @BillingCycle  NVARCHAR(20),
    @AmountUsd     DECIMAL(10,2),
    @Provider      NVARCHAR(50),
    @ExternalTxnId NVARCHAR(200),
    @PaymentStatus NVARCHAR(30),
    @ExpiresOn     DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    UPDATE dbo.Subscriptions
    SET Status = 'Cancelled', UpdatedOn = SYSUTCDATETIME()
    WHERE BusinessId = @BusinessId AND Status IN ('Active', 'PastDue');

    INSERT INTO dbo.Subscriptions (BusinessId, PlanId, BillingCycle, Status, StartsOn, ExpiresOn)
    VALUES (@BusinessId, @PlanId, @BillingCycle, 'Active', SYSUTCDATETIME(), @ExpiresOn);

    DECLARE @NewSubId INT = CAST(SCOPE_IDENTITY() AS INT);

    INSERT INTO dbo.Payments (BusinessId, SubscriptionId, AmountUsd, Currency, Provider, ExternalTxnId, Status, PaidOn)
    VALUES (
        @BusinessId,
        @NewSubId,
        @AmountUsd,
        'USD',
        @Provider,
        @ExternalTxnId,
        @PaymentStatus,
        CASE WHEN @PaymentStatus = 'Succeeded' THEN SYSUTCDATETIME() ELSE NULL END
    );

    COMMIT TRAN;

    SELECT @NewSubId AS SubscriptionId;
END
GO

-- 6. Super Admin: List All Subscriptions
CREATE OR ALTER PROCEDURE dbo.usp_Admin_ListSubscriptions
    @Search   NVARCHAR(150) = N'',
    @Status   NVARCHAR(30) = N'all',
    @Page     INT = 1,
    @PageSize INT = 15
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@Page - 1) * @PageSize;

    SELECT
        s.SubscriptionId, s.BusinessId, b.Name AS BusinessName, b.Status AS BusinessStatus,
        s.PlanId, sp.Code AS PlanCode, sp.Name AS PlanName,
        s.BillingCycle, s.Status, s.StartsOn, s.ExpiresOn, s.CreatedOn,
        sp.MonthlyPriceUsd, sp.YearlyPriceUsd
    FROM dbo.Subscriptions s
    JOIN dbo.Businesses b ON b.BusinessId = s.BusinessId
    JOIN dbo.SubscriptionPlans sp ON sp.PlanId = s.PlanId
    WHERE (@Status = N'all' OR LOWER(s.Status) = LOWER(@Status))
      AND (@Search = N'' OR b.Name LIKE N'%' + @Search + N'%' OR sp.Name LIKE N'%' + @Search + N'%')
    ORDER BY s.UpdatedOn DESC, s.SubscriptionId DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- 7. Super Admin: List All Payments
CREATE OR ALTER PROCEDURE dbo.usp_Admin_ListPayments
    @Search   NVARCHAR(150) = N'',
    @Status   NVARCHAR(30) = N'all',
    @Provider NVARCHAR(50) = N'all',
    @Page     INT = 1,
    @PageSize INT = 15
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@Page - 1) * @PageSize;

    SELECT
        p.PaymentId, p.BusinessId, b.Name AS BusinessName, p.SubscriptionId,
        sp.Name AS PlanName, s.BillingCycle, p.AmountUsd, p.Currency,
        p.Provider, p.ExternalTxnId, p.Status, p.PaidOn, p.CreatedOn
    FROM dbo.Payments p
    JOIN dbo.Businesses b ON b.BusinessId = p.BusinessId
    JOIN dbo.Subscriptions s ON s.SubscriptionId = p.SubscriptionId
    JOIN dbo.SubscriptionPlans sp ON sp.PlanId = s.PlanId
    WHERE (@Status = N'all' OR LOWER(p.Status) = LOWER(@Status))
      AND (@Provider = N'all' OR LOWER(p.Provider) = LOWER(@Provider))
      AND (@Search = N'' OR b.Name LIKE N'%' + @Search + N'%' OR ISNULL(p.ExternalTxnId, N'') LIKE N'%' + @Search + N'%')
    ORDER BY p.CreatedOn DESC, p.PaymentId DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- 8. Support Tickets CRUD & Replies
CREATE OR ALTER PROCEDURE dbo.usp_Tickets_Create
    @BusinessId INT,
    @UserId     INT,
    @Subject    NVARCHAR(255),
    @Category   NVARCHAR(60),
    @Priority   NVARCHAR(20),
    @Body       NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;
    INSERT INTO dbo.SupportTickets (BusinessId, UserId, Subject, Category, Status, Priority, LastRepliedOn)
    VALUES (@BusinessId, @UserId, @Subject, @Category, 'Open', @Priority, SYSUTCDATETIME());

    DECLARE @TicketId INT = CAST(SCOPE_IDENTITY() AS INT);

    INSERT INTO dbo.SupportTicketMessages (TicketId, UserId, SenderRole, Body)
    VALUES (@TicketId, @UserId, 'Business', @Body);

    COMMIT TRAN;
    SELECT @TicketId AS TicketId;
END
GO

-- 9. System Settings Read & Upsert
CREATE OR ALTER PROCEDURE dbo.usp_SystemSettings_GetAll
AS
BEGIN
    SET NOCOUNT ON;
    SELECT SettingKey, SettingValue, Description, UpdatedOn
    FROM dbo.SystemSettings
    ORDER BY SettingKey ASC;
END
GO

-- 10. AI Providers Management
CREATE OR ALTER PROCEDURE dbo.usp_Admin_UpdateAiProvider
    @ProviderId          INT,
    @Name                NVARCHAR(100),
    @SupportedModelsJson NVARCHAR(MAX),
    @IsActive            BIT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.AIProviders
    SET Name = @Name,
        SupportedModelsJson = @SupportedModelsJson,
        IsActive = @IsActive,
        UpdatedOn = SYSUTCDATETIME()
    WHERE ProviderId = @ProviderId;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO
