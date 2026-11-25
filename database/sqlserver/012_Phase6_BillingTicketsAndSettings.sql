-- ============================================================================
-- ChatPilot AI - Phase 6: Billing Plans, Support Tickets & System Settings
-- File: 012_Phase6_BillingTicketsAndSettings.sql
-- Target: Microsoft SQL Server 2019+ / Azure SQL
-- ============================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Extend dbo.SubscriptionPlans with optional Plan Description
IF COL_LENGTH('dbo.SubscriptionPlans', 'Description') IS NULL
BEGIN
    ALTER TABLE dbo.SubscriptionPlans ADD Description NVARCHAR(500) NULL;
END
GO

-- 2. Extend dbo.SupportTickets with Category & LastRepliedOn
IF COL_LENGTH('dbo.SupportTickets', 'Category') IS NULL
BEGIN
    ALTER TABLE dbo.SupportTickets ADD Category NVARCHAR(60) NOT NULL CONSTRAINT DF_Tickets_Category DEFAULT ('General');
END
GO

IF COL_LENGTH('dbo.SupportTickets', 'LastRepliedOn') IS NULL
BEGIN
    ALTER TABLE dbo.SupportTickets ADD LastRepliedOn DATETIME2(3) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_SupportTickets_Business_Status' AND object_id = OBJECT_ID('dbo.SupportTickets')
)
BEGIN
    CREATE INDEX IX_SupportTickets_Business_Status
        ON dbo.SupportTickets(BusinessId, Status, UpdatedOn DESC)
        INCLUDE (Priority, Subject, Category, CreatedOn);
END
GO

-- 3. SupportTicketMessages (Threaded replies between Tenant & Super Admin)
IF OBJECT_ID('dbo.SupportTicketMessages', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SupportTicketMessages (
        TicketMessageId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        TicketId        INT NOT NULL,
        UserId          INT NULL,
        SenderRole      NVARCHAR(40) NOT NULL,
        Body            NVARCHAR(MAX) NOT NULL,
        CreatedOn       DATETIME2(3) NOT NULL CONSTRAINT DF_TicketMsgs_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn       DATETIME2(3) NOT NULL CONSTRAINT DF_TicketMsgs_UpdatedOn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_TicketMsgs_Tickets FOREIGN KEY (TicketId) REFERENCES dbo.SupportTickets(TicketId) ON DELETE CASCADE,
        CONSTRAINT FK_TicketMsgs_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE SET NULL
    );

    CREATE INDEX IX_SupportTicketMessages_Ticket
        ON dbo.SupportTicketMessages(TicketId, CreatedOn ASC);
END
GO

-- 4. SystemSettings (Platform-wide governance key-value store)
IF OBJECT_ID('dbo.SystemSettings', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SystemSettings (
        SettingKey   NVARCHAR(100) NOT NULL PRIMARY KEY,
        SettingValue NVARCHAR(1000) NOT NULL,
        Description  NVARCHAR(255) NULL,
        CreatedOn    DATETIME2(3) NOT NULL CONSTRAINT DF_SysSettings_CreatedOn DEFAULT SYSUTCDATETIME(),
        UpdatedOn    DATETIME2(3) NOT NULL CONSTRAINT DF_SysSettings_UpdatedOn DEFAULT SYSUTCDATETIME()
    );
END
GO

MERGE dbo.SystemSettings AS target
USING (VALUES
    ('AllowPublicRegistration',    'true',                  'Allow new business workspaces to self-register'),
    ('DefaultTrialDays',           '14',                    'Default trial window for paid plan upgrades'),
    ('DefaultWidgetRateLimitPerMin','60',                   'Per-minute widget request ceiling per visitor IP'),
    ('ConversationRetentionDays',  '365',                   'Retention window in days for stored widget transcripts'),
    ('MaintenanceMode',            'false',                 'Display maintenance notice for scheduled upgrades'),
    ('SupportContactEmail',        'support@chatpilot.local','Platform support contact address displayed to tenants')
) AS src(SettingKey, SettingValue, Description)
ON target.SettingKey = src.SettingKey
WHEN NOT MATCHED THEN
    INSERT (SettingKey, SettingValue, Description) VALUES (src.SettingKey, src.SettingValue, src.Description);
GO

-- 5. Covering Indexes on Subscriptions and Payments
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Subscriptions_Status_Plan' AND object_id = OBJECT_ID('dbo.Subscriptions')
)
BEGIN
    CREATE INDEX IX_Subscriptions_Status_Plan
        ON dbo.Subscriptions(Status, PlanId, BusinessId)
        INCLUDE (BillingCycle, StartsOn, ExpiresOn);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Payments_Business_PaidOn' AND object_id = OBJECT_ID('dbo.Payments')
)
BEGIN
    CREATE INDEX IX_Payments_Business_PaidOn
        ON dbo.Payments(BusinessId, Status, CreatedOn DESC)
        INCLUDE (AmountUsd, Currency, Provider, ExternalTxnId, PaidOn);
END
GO
