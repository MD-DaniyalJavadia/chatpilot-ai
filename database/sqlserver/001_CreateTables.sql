-- ============================================================================
-- ChatPilot AI - SQL Server Database Schema (Normalized 3NF)
-- File: 001_CreateTables.sql
-- Target: Microsoft SQL Server 2019+ / Azure SQL
-- ============================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Roles
IF OBJECT_ID('dbo.Roles', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Roles (
        RoleId      INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name        NVARCHAR(50) NOT NULL UNIQUE,
        Description NVARCHAR(255) NULL,
        CreatedOn   DATETIME2(3) NOT NULL CONSTRAINT DF_Roles_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn   DATETIME2(3) NOT NULL CONSTRAINT DF_Roles_UpdatedOn DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 2. Users
IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        UserId       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        FullName     NVARCHAR(150) NOT NULL,
        Email        NVARCHAR(256) NOT NULL UNIQUE,
        PasswordHash NVARCHAR(512) NOT NULL,
        IsActive     BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (1),
        LastLoginOn  DATETIME2(3) NULL,
        CreatedOn    DATETIME2(3) NOT NULL CONSTRAINT DF_Users_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn    DATETIME2(3) NOT NULL CONSTRAINT DF_Users_UpdatedOn DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_Users_Email ON dbo.Users(Email);
END
GO

-- 3. UserRoles (Global platform role mapping, e.g., SuperAdmin)
IF OBJECT_ID('dbo.UserRoles', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserRoles (
        UserRoleId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UserId     INT NOT NULL,
        RoleId     INT NOT NULL,
        CreatedOn  DATETIME2(3) NOT NULL CONSTRAINT DF_UserRoles_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn  DATETIME2(3) NOT NULL CONSTRAINT DF_UserRoles_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_UserRoles_User_Role UNIQUE (UserId, RoleId),
        CONSTRAINT FK_UserRoles_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
        CONSTRAINT FK_UserRoles_Roles FOREIGN KEY (RoleId) REFERENCES dbo.Roles(RoleId)
    );
END
GO

-- 4. RefreshTokens (Supports refresh token rotation & reuse detection)
IF OBJECT_ID('dbo.RefreshTokens', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RefreshTokens (
        RefreshTokenId      INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UserId              INT NOT NULL,
        TokenHash           NVARCHAR(128) NOT NULL UNIQUE,
        ExpiresOn           DATETIME2(3) NOT NULL,
        RevokedOn           DATETIME2(3) NULL,
        ReplacedByTokenHash NVARCHAR(128) NULL,
        CreatedByIp         NVARCHAR(64) NULL,
        CreatedOn           DATETIME2(3) NOT NULL CONSTRAINT DF_RefreshTokens_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn           DATETIME2(3) NOT NULL CONSTRAINT DF_RefreshTokens_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_RefreshTokens_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
    );
    CREATE INDEX IX_RefreshTokens_UserId ON dbo.RefreshTokens(UserId);
END
GO

-- 5. Businesses (Tenant root entity)
IF OBJECT_ID('dbo.Businesses', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Businesses (
        BusinessId   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name         NVARCHAR(200) NOT NULL,
        Slug         NVARCHAR(200) NOT NULL UNIQUE,
        Industry     NVARCHAR(100) NULL,
        WebsiteUrl   NVARCHAR(500) NULL,
        SupportEmail NVARCHAR(256) NULL,
        Timezone     NVARCHAR(64) NOT NULL CONSTRAINT DF_Businesses_Timezone DEFAULT ('UTC'),
        Status       NVARCHAR(30) NOT NULL CONSTRAINT DF_Businesses_Status DEFAULT ('Active'),
        CreatedOn    DATETIME2(3) NOT NULL CONSTRAINT DF_Businesses_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn    DATETIME2(3) NOT NULL CONSTRAINT DF_Businesses_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_Businesses_Status CHECK (Status IN ('Active', 'Suspended', 'Deactivated'))
    );
    CREATE INDEX IX_Businesses_Status ON dbo.Businesses(Status);
END
GO

-- 6. BusinessUsers (Tenant-scoped RBAC membership)
IF OBJECT_ID('dbo.BusinessUsers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BusinessUsers (
        BusinessUserId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BusinessId     INT NOT NULL,
        UserId         INT NOT NULL,
        RoleId         INT NOT NULL,
        IsPrimaryOwner BIT NOT NULL CONSTRAINT DF_BusinessUsers_Owner DEFAULT (0),
        CreatedOn      DATETIME2(3) NOT NULL CONSTRAINT DF_BusinessUsers_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn      DATETIME2(3) NOT NULL CONSTRAINT DF_BusinessUsers_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_BusinessUsers_Tenant_User UNIQUE (BusinessId, UserId),
        CONSTRAINT FK_BusinessUsers_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId),
        CONSTRAINT FK_BusinessUsers_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
        CONSTRAINT FK_BusinessUsers_Roles FOREIGN KEY (RoleId) REFERENCES dbo.Roles(RoleId)
    );
    CREATE INDEX IX_BusinessUsers_UserId ON dbo.BusinessUsers(UserId);
END
GO

-- 7. SubscriptionPlans
IF OBJECT_ID('dbo.SubscriptionPlans', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SubscriptionPlans (
        PlanId                INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Code                  NVARCHAR(50) NOT NULL UNIQUE,
        Name                  NVARCHAR(100) NOT NULL,
        MonthlyPriceUsd       DECIMAL(10,2) NOT NULL,
        YearlyPriceUsd        DECIMAL(10,2) NOT NULL,
        MaxChatbots           INT NOT NULL,
        MaxMonthlyMessages    INT NOT NULL,
        MaxTeamMembers        INT NOT NULL,
        AllowWebsiteIngestion BIT NOT NULL CONSTRAINT DF_Plans_WebIngest DEFAULT (0),
        IsActive              BIT NOT NULL CONSTRAINT DF_Plans_IsActive DEFAULT (1),
        CreatedOn             DATETIME2(3) NOT NULL CONSTRAINT DF_Plans_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn             DATETIME2(3) NOT NULL CONSTRAINT DF_Plans_UpdatedOn DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 8. Subscriptions
IF OBJECT_ID('dbo.Subscriptions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Subscriptions (
        SubscriptionId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BusinessId     INT NOT NULL,
        PlanId         INT NOT NULL,
        BillingCycle   NVARCHAR(20) NOT NULL CONSTRAINT DF_Subs_Cycle DEFAULT ('Monthly'),
        Status         NVARCHAR(30) NOT NULL CONSTRAINT DF_Subs_Status DEFAULT ('Active'),
        StartsOn       DATETIME2(3) NOT NULL,
        ExpiresOn      DATETIME2(3) NULL,
        CreatedOn      DATETIME2(3) NOT NULL CONSTRAINT DF_Subs_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn      DATETIME2(3) NOT NULL CONSTRAINT DF_Subs_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Subscriptions_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId),
        CONSTRAINT FK_Subscriptions_Plans FOREIGN KEY (PlanId) REFERENCES dbo.SubscriptionPlans(PlanId),
        CONSTRAINT CK_Subscriptions_Status CHECK (Status IN ('Active', 'Expired', 'Cancelled', 'PastDue'))
    );
    CREATE INDEX IX_Subscriptions_BusinessId ON dbo.Subscriptions(BusinessId);
END
GO

-- 9. Payments
IF OBJECT_ID('dbo.Payments', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Payments (
        PaymentId        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BusinessId       INT NOT NULL,
        SubscriptionId   INT NOT NULL,
        AmountUsd        DECIMAL(10,2) NOT NULL,
        Currency         NVARCHAR(10) NOT NULL CONSTRAINT DF_Payments_Currency DEFAULT ('USD'),
        Provider         NVARCHAR(50) NOT NULL,
        ExternalTxnId    NVARCHAR(200) NULL,
        Status           NVARCHAR(30) NOT NULL,
        PaidOn           DATETIME2(3) NULL,
        CreatedOn        DATETIME2(3) NOT NULL CONSTRAINT DF_Payments_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn        DATETIME2(3) NOT NULL CONSTRAINT DF_Payments_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Payments_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId),
        CONSTRAINT FK_Payments_Subscriptions FOREIGN KEY (SubscriptionId) REFERENCES dbo.Subscriptions(SubscriptionId)
    );
END
GO

-- 10. Chatbots (Phase 2+)
IF OBJECT_ID('dbo.Chatbots', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Chatbots (
        ChatbotId   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BusinessId  INT NOT NULL,
        PublicId    NVARCHAR(64) NOT NULL UNIQUE,
        Name        NVARCHAR(150) NOT NULL,
        Description NVARCHAR(500) NULL,
        IsEnabled   BIT NOT NULL CONSTRAINT DF_Chatbots_IsEnabled DEFAULT (1),
        CreatedOn   DATETIME2(3) NOT NULL CONSTRAINT DF_Chatbots_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn   DATETIME2(3) NOT NULL CONSTRAINT DF_Chatbots_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Chatbots_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId)
    );
    CREATE INDEX IX_Chatbots_BusinessId ON dbo.Chatbots(BusinessId);
END
GO

-- 11. ChatbotSettings (Phase 2+)
IF OBJECT_ID('dbo.ChatbotSettings', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ChatbotSettings (
        SettingId          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ChatbotId          INT NOT NULL UNIQUE,
        AiModel            NVARCHAR(100) NOT NULL,
        SystemInstructions NVARCHAR(MAX) NULL,
        WelcomeMessage     NVARCHAR(500) NULL,
        Personality        NVARCHAR(100) NULL,
        ResponseLanguage   NVARCHAR(50) NOT NULL CONSTRAINT DF_ChatbotSettings_Lang DEFAULT ('English'),
        ResponseTone       NVARCHAR(50) NOT NULL CONSTRAINT DF_ChatbotSettings_Tone DEFAULT ('Professional'),
        BrandColor         NVARCHAR(20) NOT NULL CONSTRAINT DF_ChatbotSettings_Color DEFAULT ('#2563EB'),
        LogoUrl            NVARCHAR(500) NULL,
        HumanHandoverEmail NVARCHAR(256) NULL,
        CreatedOn          DATETIME2(3) NOT NULL CONSTRAINT DF_ChatbotSettings_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn          DATETIME2(3) NOT NULL CONSTRAINT DF_ChatbotSettings_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ChatbotSettings_Chatbots FOREIGN KEY (ChatbotId) REFERENCES dbo.Chatbots(ChatbotId)
    );
END
GO

-- 12. KnowledgeSources (Phase 3+)
IF OBJECT_ID('dbo.KnowledgeSources', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.KnowledgeSources (
        SourceId     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ChatbotId    INT NOT NULL,
        BusinessId   INT NOT NULL,
        SourceType   NVARCHAR(30) NOT NULL, -- PDF, DOCX, TXT, URL, Manual, FAQ
        Title        NVARCHAR(255) NOT NULL,
        SourceUri    NVARCHAR(1000) NULL,
        Status       NVARCHAR(30) NOT NULL CONSTRAINT DF_KS_Status DEFAULT ('Pending'),
        ErrorMessage NVARCHAR(1000) NULL,
        CreatedOn    DATETIME2(3) NOT NULL CONSTRAINT DF_KS_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn    DATETIME2(3) NOT NULL CONSTRAINT DF_KS_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_KS_Chatbots FOREIGN KEY (ChatbotId) REFERENCES dbo.Chatbots(ChatbotId),
        CONSTRAINT FK_KS_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId)
    );
END
GO

-- 13. KnowledgeChunks (Phase 3+)
IF OBJECT_ID('dbo.KnowledgeChunks', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.KnowledgeChunks (
        ChunkId       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SourceId      INT NOT NULL,
        ChatbotId     INT NOT NULL,
        BusinessId    INT NOT NULL,
        ChunkIndex    INT NOT NULL,
        Content       NVARCHAR(MAX) NOT NULL,
        EmbeddingJson NVARCHAR(MAX) NULL,
        TokenCount    INT NOT NULL CONSTRAINT DF_KC_Tokens DEFAULT (0),
        CreatedOn     DATETIME2(3) NOT NULL CONSTRAINT DF_KC_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn     DATETIME2(3) NOT NULL CONSTRAINT DF_KC_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_KC_Sources FOREIGN KEY (SourceId) REFERENCES dbo.KnowledgeSources(SourceId),
        CONSTRAINT FK_KC_Chatbots FOREIGN KEY (ChatbotId) REFERENCES dbo.Chatbots(ChatbotId),
        CONSTRAINT FK_KC_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId)
    );
END
GO

-- 14. Conversations (Phase 4+)
IF OBJECT_ID('dbo.Conversations', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Conversations (
        ConversationId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ChatbotId      INT NOT NULL,
        BusinessId     INT NOT NULL,
        VisitorSession NVARCHAR(128) NOT NULL,
        VisitorDomain  NVARCHAR(255) NULL,
        IsResolved     BIT NOT NULL CONSTRAINT DF_Conv_Resolved DEFAULT (0),
        CreatedOn      DATETIME2(3) NOT NULL CONSTRAINT DF_Conv_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn      DATETIME2(3) NOT NULL CONSTRAINT DF_Conv_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Conv_Chatbots FOREIGN KEY (ChatbotId) REFERENCES dbo.Chatbots(ChatbotId),
        CONSTRAINT FK_Conv_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId)
    );
END
GO

-- 15. Messages (Phase 4+)
IF OBJECT_ID('dbo.Messages', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Messages (
        MessageId      INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ConversationId INT NOT NULL,
        BusinessId     INT NOT NULL,
        SenderType     NVARCHAR(20) NOT NULL, -- User, Assistant, System
        Content        NVARCHAR(MAX) NOT NULL,
        TokensUsed     INT NOT NULL CONSTRAINT DF_Msg_Tokens DEFAULT (0),
        IsUnanswered   BIT NOT NULL CONSTRAINT DF_Msg_Unanswered DEFAULT (0),
        CreatedOn      DATETIME2(3) NOT NULL CONSTRAINT DF_Msg_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn      DATETIME2(3) NOT NULL CONSTRAINT DF_Msg_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Msg_Conversations FOREIGN KEY (ConversationId) REFERENCES dbo.Conversations(ConversationId),
        CONSTRAINT FK_Msg_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId)
    );
END
GO

-- 16. UsageLogs
IF OBJECT_ID('dbo.UsageLogs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.UsageLogs (
        UsageLogId   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BusinessId   INT NOT NULL,
        ChatbotId    INT NULL,
        TokensUsed   INT NOT NULL CONSTRAINT DF_Usage_Tokens DEFAULT (0),
        MessageCount INT NOT NULL CONSTRAINT DF_Usage_Msgs DEFAULT (0),
        ModelName    NVARCHAR(100) NULL,
        CreatedOn    DATETIME2(3) NOT NULL CONSTRAINT DF_Usage_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn    DATETIME2(3) NOT NULL CONSTRAINT DF_Usage_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Usage_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId),
        CONSTRAINT FK_Usage_Chatbots FOREIGN KEY (ChatbotId) REFERENCES dbo.Chatbots(ChatbotId)
    );
END
GO

-- 17. ApiKeys
IF OBJECT_ID('dbo.ApiKeys', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ApiKeys (
        ApiKeyId   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BusinessId INT NOT NULL,
        Label      NVARCHAR(100) NOT NULL,
        KeyHash    NVARCHAR(128) NOT NULL UNIQUE,
        KeyPrefix  NVARCHAR(16) NOT NULL,
        IsRevoked  BIT NOT NULL CONSTRAINT DF_ApiKeys_Revoked DEFAULT (0),
        CreatedOn  DATETIME2(3) NOT NULL CONSTRAINT DF_ApiKeys_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn  DATETIME2(3) NOT NULL CONSTRAINT DF_ApiKeys_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ApiKeys_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId)
    );
END
GO

-- 18. AllowedDomains
IF OBJECT_ID('dbo.AllowedDomains', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AllowedDomains (
        AllowedDomainId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ChatbotId       INT NOT NULL,
        BusinessId      INT NOT NULL,
        Domain          NVARCHAR(255) NOT NULL,
        CreatedOn       DATETIME2(3) NOT NULL CONSTRAINT DF_AD_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn       DATETIME2(3) NOT NULL CONSTRAINT DF_AD_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_AD_Chatbots FOREIGN KEY (ChatbotId) REFERENCES dbo.Chatbots(ChatbotId),
        CONSTRAINT FK_AD_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId)
    );
END
GO

-- 19. SupportTickets
IF OBJECT_ID('dbo.SupportTickets', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SupportTickets (
        TicketId   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BusinessId INT NOT NULL,
        UserId     INT NOT NULL,
        Subject    NVARCHAR(255) NOT NULL,
        Status     NVARCHAR(30) NOT NULL CONSTRAINT DF_Tickets_Status DEFAULT ('Open'),
        Priority   NVARCHAR(20) NOT NULL CONSTRAINT DF_Tickets_Priority DEFAULT ('Normal'),
        CreatedOn  DATETIME2(3) NOT NULL CONSTRAINT DF_Tickets_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn  DATETIME2(3) NOT NULL CONSTRAINT DF_Tickets_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Tickets_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId),
        CONSTRAINT FK_Tickets_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
    );
END
GO

-- 20. AuditLogs
IF OBJECT_ID('dbo.AuditLogs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditLogs (
        AuditLogId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UserId     INT NULL,
        BusinessId INT NULL,
        Action     NVARCHAR(100) NOT NULL,
        EntityType NVARCHAR(100) NOT NULL,
        EntityId   NVARCHAR(100) NULL,
        Details    NVARCHAR(MAX) NULL,
        IpAddress  NVARCHAR(64) NULL,
        CreatedOn  DATETIME2(3) NOT NULL CONSTRAINT DF_Audit_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn  DATETIME2(3) NOT NULL CONSTRAINT DF_Audit_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Audit_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
        CONSTRAINT FK_Audit_Businesses FOREIGN KEY (BusinessId) REFERENCES dbo.Businesses(BusinessId)
    );
    CREATE INDEX IX_AuditLogs_BusinessId ON dbo.AuditLogs(BusinessId);
    CREATE INDEX IX_AuditLogs_CreatedOn ON dbo.AuditLogs(CreatedOn DESC);
END
GO
