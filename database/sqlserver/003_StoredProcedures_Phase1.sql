-- ============================================================================
-- ChatPilot AI - Phase 1 Stored Procedures (Auth, Tenants, Users, Dashboards)
-- File: 003_StoredProcedures_Phase1.sql
-- ============================================================================

-- 1. Check if SuperAdmin exists
CREATE OR ALTER PROCEDURE dbo.usp_Auth_IsSuperAdminClaimed
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.UserRoles ur
        INNER JOIN dbo.Roles r ON ur.RoleId = r.RoleId
        WHERE r.Name = 'SuperAdmin'
    ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS SuperAdminClaimed;
END
GO

-- 2. Get User Auth Context by Email
CREATE OR ALTER PROCEDURE dbo.usp_Users_GetAuthByEmail
    @Email NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 1
        u.UserId,
        u.FullName,
        u.Email,
        u.PasswordHash,
        u.IsActive,
        u.CreatedOn,
        COALESCE(globalRole.Name, bizRole.Name) AS RoleName,
        bu.BusinessId,
        b.Name AS BusinessName,
        b.Status AS BusinessStatus
    FROM dbo.Users u
    OUTER APPLY (
        SELECT TOP 1 r.Name
        FROM dbo.UserRoles ur
        INNER JOIN dbo.Roles r ON ur.RoleId = r.RoleId
        WHERE ur.UserId = u.UserId
    ) globalRole
    OUTER APPLY (
        SELECT TOP 1 bu2.BusinessId, r2.Name
        FROM dbo.BusinessUsers bu2
        INNER JOIN dbo.Roles r2 ON bu2.RoleId = r2.RoleId
        WHERE bu2.UserId = u.UserId
        ORDER BY bu2.IsPrimaryOwner DESC, bu2.BusinessUserId ASC
    ) bizRole
    LEFT JOIN dbo.BusinessUsers bu ON bu.UserId = u.UserId AND bu.BusinessId = bizRole.BusinessId
    LEFT JOIN dbo.Businesses b ON b.BusinessId = bu.BusinessId
    WHERE LOWER(u.Email) = LOWER(@Email);
END
GO

-- 3. Register Business Owner + Business + Free Subscription (Atomic)
CREATE OR ALTER PROCEDURE dbo.usp_Auth_RegisterBusinessOwner
    @FullName     NVARCHAR(150),
    @Email        NVARCHAR(256),
    @PasswordHash NVARCHAR(512),
    @BusinessName NVARCHAR(200),
    @Slug         NVARCHAR(200),
    @Industry     NVARCHAR(100) = NULL,
    @WebsiteUrl   NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM dbo.Users WHERE LOWER(Email) = LOWER(@Email))
        BEGIN
            ROLLBACK TRAN;
            RAISERROR('Email is already registered.', 16, 1);
            RETURN;
        END

        INSERT INTO dbo.Users (FullName, Email, PasswordHash, IsActive)
        VALUES (@FullName, LOWER(@Email), @PasswordHash, 1);
        DECLARE @UserId INT = SCOPE_IDENTITY();

        INSERT INTO dbo.Businesses (Name, Slug, Industry, WebsiteUrl, SupportEmail, Status)
        VALUES (@BusinessName, @Slug, @Industry, @WebsiteUrl, LOWER(@Email), 'Active');
        DECLARE @BusinessId INT = SCOPE_IDENTITY();

        DECLARE @OwnerRoleId INT = (SELECT RoleId FROM dbo.Roles WHERE Name = 'BusinessOwner');
        INSERT INTO dbo.BusinessUsers (BusinessId, UserId, RoleId, IsPrimaryOwner)
        VALUES (@BusinessId, @UserId, @OwnerRoleId, 1);

        DECLARE @FreePlanId INT = (SELECT PlanId FROM dbo.SubscriptionPlans WHERE Code = 'FREE');
        INSERT INTO dbo.Subscriptions (BusinessId, PlanId, BillingCycle, Status, StartsOn)
        VALUES (@BusinessId, @FreePlanId, 'Monthly', 'Active', SYSUTCDATETIME());

        SELECT @UserId AS UserId, @BusinessId AS BusinessId, 'BusinessOwner' AS RoleName;
    COMMIT TRAN;
END
GO

-- 4. Insert Refresh Token
CREATE OR ALTER PROCEDURE dbo.usp_RefreshTokens_Insert
    @UserId      INT,
    @TokenHash   NVARCHAR(128),
    @ExpiresOn   DATETIME2(3),
    @CreatedByIp NVARCHAR(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.RefreshTokens (UserId, TokenHash, ExpiresOn, CreatedByIp)
    VALUES (@UserId, @TokenHash, @ExpiresOn, @CreatedByIp);
END
GO

-- 5. Rotate Refresh Token
CREATE OR ALTER PROCEDURE dbo.usp_RefreshTokens_Rotate
    @OldTokenHash NVARCHAR(128),
    @NewTokenHash NVARCHAR(128),
    @NewExpiresOn DATETIME2(3),
    @IpAddress    NVARCHAR(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;
        DECLARE @UserId INT, @RevokedOn DATETIME2(3), @ExpiresOn DATETIME2(3);
        SELECT @UserId = UserId, @RevokedOn = RevokedOn, @ExpiresOn = ExpiresOn
        FROM dbo.RefreshTokens
        WHERE TokenHash = @OldTokenHash;

        IF @UserId IS NULL OR @RevokedOn IS NOT NULL OR @ExpiresOn <= SYSUTCDATETIME()
        BEGIN
            IF @UserId IS NOT NULL AND @RevokedOn IS NOT NULL
            BEGIN
                -- Reuse detected: revoke all active tokens for user
                UPDATE dbo.RefreshTokens
                SET RevokedOn = SYSUTCDATETIME(), UpdatedOn = SYSUTCDATETIME()
                WHERE UserId = @UserId AND RevokedOn IS NULL;
            END
            ROLLBACK TRAN;
            SELECT CAST(0 AS BIT) AS IsValid, NULL AS UserId;
            RETURN;
        END

        UPDATE dbo.RefreshTokens
        SET RevokedOn = SYSUTCDATETIME(), ReplacedByTokenHash = @NewTokenHash, UpdatedOn = SYSUTCDATETIME()
        WHERE TokenHash = @OldTokenHash;

        INSERT INTO dbo.RefreshTokens (UserId, TokenHash, ExpiresOn, CreatedByIp)
        VALUES (@UserId, @NewTokenHash, @NewExpiresOn, @IpAddress);

        SELECT CAST(1 AS BIT) AS IsValid, @UserId AS UserId;
    COMMIT TRAN;
END
GO

-- 6. Super Admin Dashboard Metrics
CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_GetSuperAdminMetrics
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        (SELECT COUNT(1) FROM dbo.Users) AS TotalUsers,
        (SELECT COUNT(1) FROM dbo.Businesses) AS TotalBusinesses,
        (SELECT COUNT(1) FROM dbo.Chatbots WHERE IsEnabled = 1) AS TotalActiveChatbots,
        (SELECT COUNT(1) FROM dbo.Conversations) AS TotalConversations,
        (SELECT COUNT(1) FROM dbo.Messages) AS TotalMessages,
        (SELECT COALESCE(SUM(TokensUsed), 0) FROM dbo.UsageLogs) AS TotalAiTokensUsed,
        (SELECT COALESCE(SUM(AmountUsd), 0.00) FROM dbo.Payments WHERE Status = 'Succeeded' AND PaidOn >= DATEADD(DAY, -30, SYSUTCDATETIME())) AS MonthlyRevenueUsd,
        (SELECT COUNT(1) FROM dbo.Subscriptions WHERE Status = 'Active') AS ActiveSubscriptions,
        (SELECT COUNT(1) FROM dbo.Subscriptions WHERE Status = 'Expired') AS ExpiredSubscriptions;
END
GO

-- 7. Business Dashboard Metrics (Strictly scoped by @BusinessId)
CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_GetBusinessMetrics
    @BusinessId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        b.BusinessId,
        b.Name AS BusinessName,
        b.Status AS BusinessStatus,
        sp.Name AS PlanName,
        sp.MaxChatbots,
        sp.MaxMonthlyMessages,
        sp.MaxTeamMembers,
        (SELECT COUNT(1) FROM dbo.BusinessUsers WHERE BusinessId = @BusinessId) AS TeamMemberCount,
        (SELECT COUNT(1) FROM dbo.Chatbots WHERE BusinessId = @BusinessId) AS ChatbotCount,
        (SELECT COUNT(1) FROM dbo.Conversations WHERE BusinessId = @BusinessId) AS ConversationCount,
        (SELECT COUNT(1) FROM dbo.Messages WHERE BusinessId = @BusinessId) AS MessageCount,
        (SELECT COALESCE(SUM(TokensUsed), 0) FROM dbo.UsageLogs WHERE BusinessId = @BusinessId) AS TokensUsed
    FROM dbo.Businesses b
    LEFT JOIN dbo.Subscriptions s ON s.BusinessId = b.BusinessId AND s.Status = 'Active'
    LEFT JOIN dbo.SubscriptionPlans sp ON sp.PlanId = s.PlanId
    WHERE b.BusinessId = @BusinessId;
END
GO

-- 8. Update Business Status (SuperAdmin)
CREATE OR ALTER PROCEDURE dbo.usp_Businesses_UpdateStatus
    @BusinessId INT,
    @Status     NVARCHAR(30)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Businesses
    SET Status = @Status, UpdatedOn = SYSUTCDATETIME()
    WHERE BusinessId = @BusinessId;
END
GO

-- 9. Update Business Profile (Tenant Scoped)
CREATE OR ALTER PROCEDURE dbo.usp_Businesses_UpdateProfile
    @BusinessId   INT,
    @Name         NVARCHAR(200),
    @Industry     NVARCHAR(100) = NULL,
    @WebsiteUrl   NVARCHAR(500) = NULL,
    @SupportEmail NVARCHAR(256) = NULL,
    @Timezone     NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Businesses
    SET Name = @Name,
        Industry = @Industry,
        WebsiteUrl = @WebsiteUrl,
        SupportEmail = @SupportEmail,
        Timezone = @Timezone,
        UpdatedOn = SYSUTCDATETIME()
    WHERE BusinessId = @BusinessId;
END
GO

-- 10. Insert Audit Log
CREATE OR ALTER PROCEDURE dbo.usp_AuditLogs_Insert
    @UserId     INT = NULL,
    @BusinessId INT = NULL,
    @Action     NVARCHAR(100),
    @EntityType NVARCHAR(100),
    @EntityId   NVARCHAR(100) = NULL,
    @Details    NVARCHAR(MAX) = NULL,
    @IpAddress  NVARCHAR(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.AuditLogs (UserId, BusinessId, Action, EntityType, EntityId, Details, IpAddress)
    VALUES (@UserId, @BusinessId, @Action, @EntityType, @EntityId, @Details, @IpAddress);
END
GO
