import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'chatpilot.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Roles (
      RoleId      INTEGER PRIMARY KEY AUTOINCREMENT,
      Name        TEXT NOT NULL UNIQUE,
      Description TEXT,
      CreatedOn   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS Users (
      UserId       INTEGER PRIMARY KEY AUTOINCREMENT,
      FullName     TEXT NOT NULL,
      Email        TEXT NOT NULL UNIQUE COLLATE NOCASE,
      PasswordHash TEXT NOT NULL,
      IsActive     INTEGER NOT NULL DEFAULT 1,
      LastLoginOn  TEXT,
      CreatedOn    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS UserRoles (
      UserRoleId INTEGER PRIMARY KEY AUTOINCREMENT,
      UserId     INTEGER NOT NULL REFERENCES Users(UserId) ON DELETE CASCADE,
      RoleId     INTEGER NOT NULL REFERENCES Roles(RoleId),
      CreatedOn  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (UserId, RoleId)
    );

    CREATE TABLE IF NOT EXISTS RefreshTokens (
      RefreshTokenId      INTEGER PRIMARY KEY AUTOINCREMENT,
      UserId              INTEGER NOT NULL REFERENCES Users(UserId) ON DELETE CASCADE,
      TokenHash           TEXT NOT NULL UNIQUE,
      ExpiresOn           TEXT NOT NULL,
      RevokedOn           TEXT,
      ReplacedByTokenHash TEXT,
      CreatedByIp         TEXT,
      CreatedOn           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS Businesses (
      BusinessId   INTEGER PRIMARY KEY AUTOINCREMENT,
      Name         TEXT NOT NULL,
      Slug         TEXT NOT NULL UNIQUE,
      Industry     TEXT,
      WebsiteUrl   TEXT,
      SupportEmail TEXT,
      Timezone     TEXT NOT NULL DEFAULT 'UTC',
      Status       TEXT NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active', 'Suspended', 'Deactivated')),
      CreatedOn    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS BusinessUsers (
      BusinessUserId INTEGER PRIMARY KEY AUTOINCREMENT,
      BusinessId     INTEGER NOT NULL REFERENCES Businesses(BusinessId) ON DELETE CASCADE,
      UserId         INTEGER NOT NULL REFERENCES Users(UserId) ON DELETE CASCADE,
      RoleId         INTEGER NOT NULL REFERENCES Roles(RoleId),
      IsPrimaryOwner INTEGER NOT NULL DEFAULT 0,
      CreatedOn      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (BusinessId, UserId)
    );

    CREATE TABLE IF NOT EXISTS SubscriptionPlans (
      PlanId                INTEGER PRIMARY KEY AUTOINCREMENT,
      Code                  TEXT NOT NULL UNIQUE,
      Name                  TEXT NOT NULL,
      MonthlyPriceUsd       REAL NOT NULL,
      YearlyPriceUsd        REAL NOT NULL,
      MaxChatbots           INTEGER NOT NULL,
      MaxMonthlyMessages    INTEGER NOT NULL,
      MaxTeamMembers        INTEGER NOT NULL,
      AllowWebsiteIngestion INTEGER NOT NULL DEFAULT 0,
      IsActive              INTEGER NOT NULL DEFAULT 1,
      CreatedOn             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS Subscriptions (
      SubscriptionId INTEGER PRIMARY KEY AUTOINCREMENT,
      BusinessId     INTEGER NOT NULL REFERENCES Businesses(BusinessId) ON DELETE CASCADE,
      PlanId         INTEGER NOT NULL REFERENCES SubscriptionPlans(PlanId),
      BillingCycle   TEXT NOT NULL DEFAULT 'Monthly',
      Status         TEXT NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active', 'Expired', 'Cancelled', 'PastDue')),
      StartsOn       TEXT NOT NULL,
      ExpiresOn      TEXT,
      CreatedOn      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS Payments (
      PaymentId      INTEGER PRIMARY KEY AUTOINCREMENT,
      BusinessId     INTEGER NOT NULL REFERENCES Businesses(BusinessId),
      SubscriptionId INTEGER NOT NULL REFERENCES Subscriptions(SubscriptionId),
      AmountUsd      REAL NOT NULL,
      Currency       TEXT NOT NULL DEFAULT 'USD',
      Provider       TEXT NOT NULL,
      ExternalTxnId  TEXT,
      Status         TEXT NOT NULL,
      PaidOn         TEXT,
      CreatedOn      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS AIProviders (
      ProviderId          INTEGER PRIMARY KEY AUTOINCREMENT,
      Code                TEXT NOT NULL UNIQUE,
      Name                TEXT NOT NULL,
      SupportedModelsJson TEXT NOT NULL,
      IsActive            INTEGER NOT NULL DEFAULT 1,
      CreatedOn           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS Chatbots (
      ChatbotId    INTEGER PRIMARY KEY AUTOINCREMENT,
      BusinessId   INTEGER NOT NULL REFERENCES Businesses(BusinessId) ON DELETE CASCADE,
      PublicId     TEXT NOT NULL UNIQUE,
      Name         TEXT NOT NULL,
      Description  TEXT,
      BusinessName TEXT NOT NULL DEFAULT '',
      WebsiteUrl   TEXT,
      IsEnabled    INTEGER NOT NULL DEFAULT 1,
      CreatedOn    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS ChatbotSettings (
      SettingId                 INTEGER PRIMARY KEY AUTOINCREMENT,
      ChatbotId                 INTEGER NOT NULL UNIQUE REFERENCES Chatbots(ChatbotId) ON DELETE CASCADE,
      AiProvider                TEXT NOT NULL DEFAULT 'GOOGLE_GEMINI',
      AiModel                   TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      SystemInstructions        TEXT,
      WelcomeMessage            TEXT,
      FallbackMessage           TEXT,
      Personality               TEXT,
      ResponseLanguage          TEXT NOT NULL DEFAULT 'English',
      ResponseTone              TEXT NOT NULL DEFAULT 'Professional',
      Temperature               REAL NOT NULL DEFAULT 0.7,
      MaxOutputTokens           INTEGER NOT NULL DEFAULT 2048,
      BrandColor                TEXT NOT NULL DEFAULT '#2563EB',
      LogoUrl                   TEXT,
      HumanHandoverEmail        TEXT,
      EnableConversationHistory INTEGER NOT NULL DEFAULT 1,
      EnableHumanHandover       INTEGER NOT NULL DEFAULT 0,
      EnableFollowUpQuestions   INTEGER NOT NULL DEFAULT 1,
      CreatedOn                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS KnowledgeSources (
      SourceId      INTEGER PRIMARY KEY AUTOINCREMENT,
      ChatbotId     INTEGER NOT NULL REFERENCES Chatbots(ChatbotId) ON DELETE CASCADE,
      BusinessId    INTEGER NOT NULL REFERENCES Businesses(BusinessId) ON DELETE CASCADE,
      SourceType    TEXT NOT NULL CHECK (SourceType IN ('PDF', 'DOCX', 'TXT', 'URL', 'Manual', 'FAQ')),
      Title         TEXT NOT NULL,
      SourceUri     TEXT,
      FileName      TEXT,
      FileSizeBytes INTEGER,
      RawText       TEXT,
      FaqQuestion   TEXT,
      FaqAnswer     TEXT,
      Status        TEXT NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'Processing', 'Indexed', 'Failed')),
      ErrorMessage  TEXT,
      ChunkCount    INTEGER NOT NULL DEFAULT 0,
      TotalTokens   INTEGER NOT NULL DEFAULT 0,
      LastIndexedOn TEXT,
      CreatedOn     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS IX_KnowledgeSources_Chatbot_Business
      ON KnowledgeSources(ChatbotId, BusinessId, Status, SourceType);

    CREATE TABLE IF NOT EXISTS KnowledgeChunks (
      ChunkId       INTEGER PRIMARY KEY AUTOINCREMENT,
      SourceId      INTEGER NOT NULL REFERENCES KnowledgeSources(SourceId) ON DELETE CASCADE,
      ChatbotId     INTEGER NOT NULL REFERENCES Chatbots(ChatbotId) ON DELETE CASCADE,
      BusinessId    INTEGER NOT NULL REFERENCES Businesses(BusinessId) ON DELETE CASCADE,
      ChunkIndex    INTEGER NOT NULL,
      Content       TEXT NOT NULL,
      EmbeddingJson TEXT,
      TokenCount    INTEGER NOT NULL DEFAULT 0,
      CreatedOn     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS IX_KnowledgeChunks_Chatbot_Business
      ON KnowledgeChunks(ChatbotId, BusinessId, SourceId);

    CREATE TABLE IF NOT EXISTS Conversations (
      ConversationId INTEGER PRIMARY KEY AUTOINCREMENT,
      ChatbotId      INTEGER NOT NULL REFERENCES Chatbots(ChatbotId) ON DELETE CASCADE,
      BusinessId     INTEGER NOT NULL REFERENCES Businesses(BusinessId) ON DELETE CASCADE,
      VisitorSession TEXT NOT NULL,
      VisitorDomain  TEXT,
      IsResolved     INTEGER NOT NULL DEFAULT 0,
      CreatedOn      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS Messages (
      MessageId      INTEGER PRIMARY KEY AUTOINCREMENT,
      ConversationId INTEGER NOT NULL REFERENCES Conversations(ConversationId) ON DELETE CASCADE,
      BusinessId     INTEGER NOT NULL REFERENCES Businesses(BusinessId) ON DELETE CASCADE,
      SenderType     TEXT NOT NULL,
      Content        TEXT NOT NULL,
      TokensUsed     INTEGER NOT NULL DEFAULT 0,
      IsUnanswered   INTEGER NOT NULL DEFAULT 0,
      CreatedOn      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS UsageLogs (
      UsageLogId   INTEGER PRIMARY KEY AUTOINCREMENT,
      BusinessId   INTEGER NOT NULL REFERENCES Businesses(BusinessId) ON DELETE CASCADE,
      ChatbotId    INTEGER REFERENCES Chatbots(ChatbotId) ON DELETE SET NULL,
      TokensUsed   INTEGER NOT NULL DEFAULT 0,
      MessageCount INTEGER NOT NULL DEFAULT 0,
      ModelName    TEXT,
      CreatedOn    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS AllowedDomains (
      AllowedDomainId INTEGER PRIMARY KEY AUTOINCREMENT,
      ChatbotId       INTEGER NOT NULL REFERENCES Chatbots(ChatbotId) ON DELETE CASCADE,
      BusinessId      INTEGER NOT NULL REFERENCES Businesses(BusinessId) ON DELETE CASCADE,
      Domain          TEXT NOT NULL,
      CreatedOn       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (ChatbotId, Domain)
    );

    CREATE INDEX IF NOT EXISTS IX_AllowedDomains_Business_Chatbot
      ON AllowedDomains(BusinessId, ChatbotId);

    CREATE INDEX IF NOT EXISTS IX_Conversations_Chatbot_Session
      ON Conversations(ChatbotId, VisitorSession, UpdatedOn);

    CREATE INDEX IF NOT EXISTS IX_Conversations_Business_CreatedOn
      ON Conversations(BusinessId, CreatedOn, IsResolved);

    CREATE INDEX IF NOT EXISTS IX_Messages_Conversation_CreatedOn
      ON Messages(ConversationId, CreatedOn);

    CREATE INDEX IF NOT EXISTS IX_Messages_Business_CreatedOn
      ON Messages(BusinessId, CreatedOn, SenderType, IsUnanswered);

    CREATE INDEX IF NOT EXISTS IX_UsageLogs_Business_CreatedOn
      ON UsageLogs(BusinessId, CreatedOn);

    CREATE INDEX IF NOT EXISTS IX_UsageLogs_CreatedOn
      ON UsageLogs(CreatedOn, ModelName);

    CREATE TABLE IF NOT EXISTS SupportTickets (
      TicketId      INTEGER PRIMARY KEY AUTOINCREMENT,
      BusinessId    INTEGER NOT NULL REFERENCES Businesses(BusinessId) ON DELETE CASCADE,
      UserId        INTEGER NOT NULL REFERENCES Users(UserId) ON DELETE CASCADE,
      Subject       TEXT NOT NULL,
      Category      TEXT NOT NULL DEFAULT 'General',
      Status        TEXT NOT NULL DEFAULT 'Open' CHECK (Status IN ('Open', 'InProgress', 'Resolved', 'Closed')),
      Priority      TEXT NOT NULL DEFAULT 'Normal' CHECK (Priority IN ('Low', 'Normal', 'High', 'Urgent')),
      LastRepliedOn TEXT,
      CreatedOn     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS IX_SupportTickets_Business_Status
      ON SupportTickets(BusinessId, Status, UpdatedOn);

    CREATE TABLE IF NOT EXISTS SupportTicketMessages (
      TicketMessageId INTEGER PRIMARY KEY AUTOINCREMENT,
      TicketId        INTEGER NOT NULL REFERENCES SupportTickets(TicketId) ON DELETE CASCADE,
      UserId          INTEGER REFERENCES Users(UserId) ON DELETE SET NULL,
      SenderRole      TEXT NOT NULL,
      Body            TEXT NOT NULL,
      CreatedOn       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS IX_SupportTicketMessages_Ticket
      ON SupportTicketMessages(TicketId, CreatedOn);

    CREATE TABLE IF NOT EXISTS SystemSettings (
      SettingKey   TEXT PRIMARY KEY,
      SettingValue TEXT NOT NULL,
      Description  TEXT,
      CreatedOn    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS IX_Subscriptions_Status_Plan
      ON Subscriptions(Status, PlanId, BusinessId);

    CREATE INDEX IF NOT EXISTS IX_Payments_Business_PaidOn
      ON Payments(BusinessId, Status, CreatedOn);

    CREATE TABLE IF NOT EXISTS AuditLogs (
      AuditLogId INTEGER PRIMARY KEY AUTOINCREMENT,
      UserId     INTEGER REFERENCES Users(UserId) ON DELETE SET NULL,
      BusinessId INTEGER REFERENCES Businesses(BusinessId) ON DELETE SET NULL,
      Action     TEXT NOT NULL,
      EntityType TEXT NOT NULL,
      EntityId   TEXT,
      Details    TEXT,
      IpAddress  TEXT,
      CreatedOn  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UpdatedOn  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  // Safe migration for existing Phase 1 Chatbots table without deleting data
  const chatbotCols = db.prepare(`PRAGMA table_info(Chatbots)`).all() as Array<{ name: string }>;
  const colNames = new Set(chatbotCols.map((c) => c.name));
  if (!colNames.has('BusinessName')) {
    db.exec(`ALTER TABLE Chatbots ADD COLUMN BusinessName TEXT NOT NULL DEFAULT '';`);
  }
  if (!colNames.has('WebsiteUrl')) {
    db.exec(`ALTER TABLE Chatbots ADD COLUMN WebsiteUrl TEXT;`);
  }

  // Safe migration for Phase 4 ChatbotSettings widget appearance columns
  const csCols = db.prepare(`PRAGMA table_info(ChatbotSettings)`).all() as Array<{ name: string }>;
  const csColNames = new Set(csCols.map((c) => c.name));
  if (!csColNames.has('WidgetPosition')) {
    db.exec(`ALTER TABLE ChatbotSettings ADD COLUMN WidgetPosition TEXT NOT NULL DEFAULT 'bottom-right';`);
  }
  if (!csColNames.has('WidgetTitle')) {
    db.exec(`ALTER TABLE ChatbotSettings ADD COLUMN WidgetTitle TEXT;`);
  }
  if (!csColNames.has('WidgetSubtitle')) {
    db.exec(`ALTER TABLE ChatbotSettings ADD COLUMN WidgetSubtitle TEXT;`);
  }
  if (!csColNames.has('LauncherLabel')) {
    db.exec(`ALTER TABLE ChatbotSettings ADD COLUMN LauncherLabel TEXT;`);
  }
  if (!csColNames.has('ShowCitations')) {
    db.exec(`ALTER TABLE ChatbotSettings ADD COLUMN ShowCitations INTEGER NOT NULL DEFAULT 1;`);
  }

  // Safe migration for KnowledgeSources columns if upgraded from an earlier table version
  const ksCols = db.prepare(`PRAGMA table_info(KnowledgeSources)`).all() as Array<{ name: string }>;
  const ksColNames = new Set(ksCols.map((c) => c.name));
  if (!ksColNames.has('FileName')) db.exec(`ALTER TABLE KnowledgeSources ADD COLUMN FileName TEXT;`);
  if (!ksColNames.has('FileSizeBytes')) db.exec(`ALTER TABLE KnowledgeSources ADD COLUMN FileSizeBytes INTEGER;`);
  if (!ksColNames.has('RawText')) db.exec(`ALTER TABLE KnowledgeSources ADD COLUMN RawText TEXT;`);
  if (!ksColNames.has('FaqQuestion')) db.exec(`ALTER TABLE KnowledgeSources ADD COLUMN FaqQuestion TEXT;`);
  if (!ksColNames.has('FaqAnswer')) db.exec(`ALTER TABLE KnowledgeSources ADD COLUMN FaqAnswer TEXT;`);
  if (!ksColNames.has('ChunkCount')) db.exec(`ALTER TABLE KnowledgeSources ADD COLUMN ChunkCount INTEGER NOT NULL DEFAULT 0;`);
  if (!ksColNames.has('TotalTokens')) db.exec(`ALTER TABLE KnowledgeSources ADD COLUMN TotalTokens INTEGER NOT NULL DEFAULT 0;`);
  if (!ksColNames.has('LastIndexedOn')) db.exec(`ALTER TABLE KnowledgeSources ADD COLUMN LastIndexedOn TEXT;`);

  const spCols = db.prepare(`PRAGMA table_info(SubscriptionPlans)`).all() as Array<{ name: string }>;
  const spColNames = new Set(spCols.map((c) => c.name));
  if (!spColNames.has('Description')) {
    db.exec(`ALTER TABLE SubscriptionPlans ADD COLUMN Description TEXT;`);
  }

  const insertRole = db.prepare(`INSERT OR IGNORE INTO Roles (Name, Description) VALUES (?, ?)`);
  insertRole.run('SuperAdmin', 'Manages the complete ChatPilot AI SaaS platform');
  insertRole.run('BusinessOwner', 'Owns business tenant, billing, team, and all chatbots');
  insertRole.run('BusinessAdmin', 'Manages assigned business chatbots, sources, and team staff');
  insertRole.run('BusinessStaff', 'Accesses permitted conversations and chatbot views');

  const insertPlan = db.prepare(`
    INSERT OR IGNORE INTO SubscriptionPlans
      (Code, Name, Description, MonthlyPriceUsd, YearlyPriceUsd, MaxChatbots, MaxMonthlyMessages, MaxTeamMembers, AllowWebsiteIngestion)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPlan.run('FREE', 'Free', 'Evaluate ChatPilot AI with 1 assistant and document ingestion.', 0, 0, 1, 250, 1, 0);
  insertPlan.run('STARTER', 'Starter', 'For small teams embedding AI support across up to 3 assistants.', 29, 290, 3, 5000, 3, 0);
  insertPlan.run('PROFESSIONAL', 'Professional', 'Multi-assistant RAG workspace with website crawling and higher quotas.', 99, 990, 15, 50000, 10, 1);
  insertPlan.run('ENTERPRISE', 'Enterprise', 'High-volume multi-tenant deployment with priority SLA and large team seats.', 299, 2990, 100, 250000, 50, 1);

  const geminiModels = JSON.stringify([
    { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Balanced)', tier: 'standard' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Fast)', tier: 'standard' },
    { id: 'gemini-4-neon', label: 'Gemini 4 Neon (Advanced Reasoning)', tier: 'paid' },
    { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon (Deep Reasoning)', tier: 'paid' },
  ]);

  db.prepare(`
    INSERT OR IGNORE INTO AIProviders (Code, Name, SupportedModelsJson, IsActive)
    VALUES (?, ?, ?, 1)
  `).run('GOOGLE_GEMINI', 'Google Gemini', geminiModels);

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO SystemSettings (SettingKey, SettingValue, Description)
    VALUES (?, ?, ?)
  `);
  insertSetting.run('AllowPublicRegistration', 'true', 'Allow new business workspaces to self-register');
  insertSetting.run('DefaultTrialDays', '14', 'Default trial window in days for paid upgrades');
  insertSetting.run('DefaultWidgetRateLimitPerMin', '60', 'Per-minute widget request ceiling per visitor IP');
  insertSetting.run('ConversationRetentionDays', '365', 'Retention window in days for stored widget transcripts');
  insertSetting.run('MaintenanceMode', 'false', 'Enable maintenance notice banner across workspaces');
  insertSetting.run('SupportContactEmail', 'support@chatpilot.local', 'Platform support contact email address');

  purgeExpiredConversations();
}

export interface SystemSettingsValues {
  allowPublicRegistration: boolean;
  defaultTrialDays: number;
  defaultWidgetRateLimitPerMin: number;
  conversationRetentionDays: number;
  maintenanceMode: boolean;
  supportContactEmail: string;
}

export function getSystemSettings(): SystemSettingsValues {
  const rows = db
    .prepare(`SELECT SettingKey, SettingValue FROM SystemSettings`)
    .all() as Array<{ SettingKey: string; SettingValue: string }>;

  const map = new Map(rows.map((r) => [r.SettingKey, r.SettingValue]));
  return {
    allowPublicRegistration: (map.get('AllowPublicRegistration') ?? 'true') !== 'false',
    defaultTrialDays: Math.min(90, Math.max(0, Number(map.get('DefaultTrialDays') ?? 14) || 14)),
    defaultWidgetRateLimitPerMin: Math.min(
      1000,
      Math.max(5, Number(map.get('DefaultWidgetRateLimitPerMin') ?? 60) || 60)
    ),
    conversationRetentionDays: Math.min(
      3650,
      Math.max(7, Number(map.get('ConversationRetentionDays') ?? 365) || 365)
    ),
    maintenanceMode: map.get('MaintenanceMode') === 'true',
    supportContactEmail: map.get('SupportContactEmail') ?? 'support@chatpilot.local',
  };
}

export function purgeExpiredConversations(): { deletedCount: number; retentionDays: number } {
  const { conversationRetentionDays } = getSystemSettings();
  const cutoffIso = new Date(Date.now() - conversationRetentionDays * 86400 * 1000).toISOString();
  const res = db
    .prepare(`DELETE FROM Conversations WHERE UpdatedOn < ?`)
    .run(cutoffIso);
  return {
    deletedCount: Number(res.changes ?? 0),
    retentionDays: conversationRetentionDays,
  };
}

export function writeAuditLog(params: {
  userId?: number | null;
  businessId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: string | null;
  ipAddress?: string | null;
}): void {
  db.prepare(`
    INSERT INTO AuditLogs (UserId, BusinessId, Action, EntityType, EntityId, Details, IpAddress)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.userId ?? null,
    params.businessId ?? null,
    params.action,
    params.entityType,
    params.entityId != null ? String(params.entityId) : null,
    params.details ?? null,
    params.ipAddress ?? null
  );
}
