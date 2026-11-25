# Changelog

All notable changes to **ChatPilot AI** are documented in this file.

## [1.0.2] - 2026-11-25 — Production Readiness Audit & Security/Billing Hardening

### Added
- **Audit Deliverables (`/PRODUCTION_READINESS_REPORT.md`, `/walkthrough.md`)**: Documented module verification status, remediated vulnerabilities with step-by-step verification traces, testing metrics, required external secrets, and pre-launch checklist.
- **Database Lock Resilience (`/server/db.ts`)**: Configured `PRAGMA busy_timeout = 5000;` alongside WAL mode and strict foreign keys.
- **HTTP Hardening Headers & Limiter Pruning (`/server.ts`, `/server/middleware/rateLimit.ts`)**: Disabled `x-powered-by`, added `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`, and added periodic/threshold pruning of expired rate-limit buckets.

### Fixed
- **SSRF IPv6 & Bracket Defense (`/server/services/websiteCrawlerService.ts`)**: Stripped brackets from IPv6 hostnames and implemented full 16-bit IPv6 block parsing blocking loopback, ULA, link-local, multicast, documentation, IPv4-compatible, IPv4-mapped, and NAT64 internal targets.
- **Widget Domain Allowlist & Handover Safety (`/server/services/domainAllowlistService.ts`, `/server/widgetScript.ts`)**: Blocked headerless (`Origin`/`Referer` absent) requests when domain allowlist rules exist for a chatbot, validated email syntax before rendering `mailto:` handover links, and added `100dvh` mobile height fallback.
- **Billing Integrity & Entitlement Enforcement (`/server/routes/billing.ts`, `/server/services/paymentGatewayService.ts`, `/server/routes/*.ts`, `/src/pages/business/BusinessSubscriptionPage.jsx`)**:
  - Disabled paid `SandboxCard` checkout in production unless `ENABLE_SANDBOX_BILLING=true`, and rejected invalid gateway provider names.
  - Isolated pending checkouts (`ManualInvoice` / unconfirmed Stripe intents) in `PastDue` status without cancelling the existing `Active` plan until settled via `PATCH /api/v1/admin/payments/:id/status`.
  - Enforced `(ExpiresOn IS NULL OR ExpiresOn > now)` across all quota, billing, chatbot, crawler, widget, analytics, dashboard, and admin queries.
- **Session Revocation & JWT Header Checks (`/server/utils/crypto.ts`, `/server/routes/users.ts`, `/server/routes/businesses.ts`)**: Explicitly verified `alg=HS256`, `typ=JWT`, and positive integer `sub`; revoked open `RefreshTokens` atomically on password changes, user deactivation, and business suspension/deactivation.
- **Frontend UX & Cleanup (`/src/`)**: Auto-reset `aiModel` on provider change in `ChatbotConfigPage.jsx`, improved mobile layout responsiveness in `ConversationsPage.jsx` and `WidgetIntegrationPage.jsx`, surfaced pending invoice banners in `BusinessSubscriptionPage.jsx`, and removed dead `PhasePlaceholderPage.jsx`.

## [1.0.1] - 2026-11-25 — Phase 4 SSE Streaming & Phase 6 Live Settings/Provider Enforcement

### Added
- **Streaming Widget Chat (`/server/services/geminiService.ts`, `/server/routes/widget.ts`, `/server/widgetScript.ts`)**:
  - Added `generateGeminiReplyStream()` using `@google/genai` `models.generateContentStream(...)` with automatic model validation and error mapping.
  - Added Server-Sent Events (`event: meta`, `event: chunk`, `event: done`, `event: error`) streaming to `POST /api/v1/widget/:publicId/chat` when `stream: true`, `?stream=1`, or `Accept: text/event-stream` is requested, preserving standard JSON responses for non-streaming clients.
  - Updated `/widget.js` Shadow DOM chat widget to stream assistant tokens incrementally into the chat bubble with seamless JSON fallback.
- **Conversation Retention Purge (`/server/db.ts`, `/server/routes/settings.ts`, `/src/pages/admin/AdminSystemSettingsPage.jsx`)**:
  - Implemented `purgeExpiredConversations()` driven by `SystemSettings.ConversationRetentionDays`, invoked on database startup and on demand via `POST /api/v1/admin/settings/purge-expired` with audit logging (`ConversationsRetentionPurged`).

### Changed
- **Live System Settings Enforcement (`/server/`)**:
  - Added `getSystemSettings()` in `server/db.ts` and dynamic rate-limit evaluation in `server/middleware/rateLimit.ts`, wiring `DefaultWidgetRateLimitPerMin` directly into `widgetChatLimiter`.
  - Extended `GET /api/v1/auth/bootstrap-status` to expose `allowPublicRegistration`, `maintenanceMode`, `supportContactEmail`, and `defaultTrialDays`.
- **Live AI Provider & Model Validation (`/server/routes/chatbots.ts`)**:
  - Replaced hardcoded model/provider lists with `validateActiveProviderAndModel()` checking `AIProviders.IsActive` and `AIProviders.SupportedModelsJson` on chatbot create/update and playground requests.
- **Maintenance, Registration & Support UX (`/src/`)**:
  - Surfaced platform `maintenanceMode` banners across `DashboardLayout.jsx`, `LoginPage.jsx`, and `RegisterPage.jsx`, registration-closed notices in `RegisterPage.jsx`, dynamic `supportContactEmail` in `BusinessSupportPage.jsx`, and live bootstrap refresh on settings save in `AdminSystemSettingsPage.jsx`.
- **Documentation Sync**: Updated `ARCHITECTURE.md`, `PROJECT_STATUS.md`, and `CHANGELOG.md` to reflect complete Phase 1–6 modules and live runtime behavior.

## [1.0.0] - 2026-11-24 — Phase 6: Commercial Billing, Support Tickets, System Settings & AI Provider Config

### Added
- **SQL Server Phase 6 Scripts (`/database/sqlserver/`)**:
  - `012_Phase6_BillingTicketsAndSettings.sql`: Added `SubscriptionPlans.Description`, `SupportTickets.Category`/`LastRepliedOn`, `SupportTicketMessages`, `SystemSettings`, and covering indexes on `Subscriptions` and `Payments`.
  - `013_StoredProcedures_Phase6.sql`: Added 10 stored procedures for plans CRUD, business billing & plan switching, admin subscription/payment monitoring, support tickets, system settings, and AI provider configuration.
- **ASP.NET Core 8 Phase 6 Layer (`/backend-dotnet/ChatPilot.API/`)**:
  - Added `Phase6Entities.cs`, `Phase6Dtos.cs`, `IPhase6Interfaces.cs`, `Phase6Repository.cs`, `Phase6Services.cs` (`PaymentGatewayService`, `BillingService`, `TicketService`, `SettingsService`), `BillingController.cs`, `TicketsController.cs`, and `PlatformConfigController.cs`.
- **Live Express Phase 6 Runtime (`/server/`)**:
  - Added `paymentGatewayService.ts` (modular `SandboxCard`, `ManualInvoice`, and server-env `Stripe` adapter), `billing.ts` (`/api/v1/plans*`, `/api/v1/subscription*`, `/api/v1/admin/subscriptions*`, `/api/v1/admin/payments*`), `tickets.ts` (`/api/v1/tickets*`, `/api/v1/admin/tickets*`), and `settings.ts` (`/api/v1/admin/settings`, `/api/v1/admin/ai-providers*`).
  - Enforced `SystemSettings.AllowPublicRegistration` in `POST /api/v1/auth/register`.
- **Frontend Modules (`/src/`)**:
  - Added `billingService.js`, `ticketsService.js`, `platformConfigService.js`, `phase6Schemas.js`, and shared `TicketThreadDialog.jsx`.
  - Added Super Admin pages `AdminPlansPage.jsx` (`/admin/plans`), `AdminSubscriptionsPage.jsx` (`/admin/subscriptions`), `AdminPaymentsPage.jsx` (`/admin/payments`), `AdminTicketsPage.jsx` (`/admin/tickets`), `AdminSystemSettingsPage.jsx` (`/admin/system-settings`), and `AdminAiProvidersPage.jsx` (`/admin/ai-providers`).
  - Added Business Portal pages `BusinessSubscriptionPage.jsx` (`/app/subscription`) and `BusinessSupportPage.jsx` (`/app/support`).

## [0.5.0] - 2026-11-24 — Phase 5: Conversation Management, Export, Recharts Analytics & Super Admin Monitoring

### Added
- **SQL Server Phase 5 Scripts (`/database/sqlserver/`)**:
  - `010_Phase5_ConversationsAndAnalytics.sql`: Added covering indexes on `dbo.Conversations`, `dbo.Messages`, and `dbo.UsageLogs`.
  - `011_StoredProcedures_Phase5.sql`: Added 10 parameterized stored procedures (`usp_Conversations_ListByBusiness`, `usp_Conversations_GetTranscript`, `usp_Conversations_SetResolved`, `usp_Conversations_ExportByBusiness`, `usp_Analytics_BusinessOverview`, `usp_Usage_BusinessSummary`, `usp_Admin_ListChatbots`, `usp_Admin_SetChatbotStatus`, `usp_Admin_AiUsageOverview`, and `usp_Admin_ListConversations`).
- **ASP.NET Core 8 Phase 5 Layer (`/backend-dotnet/ChatPilot.API/`)**:
  - Added `AnalyticsEntities.cs`, `AnalyticsDtos.cs`, `IAnalyticsInterfaces.cs`, `AnalyticsRepository.cs`, `AnalyticsService.cs`, `ConversationsController.cs`, `AnalyticsController.cs`, and `AdminMonitoringController.cs` (with formula-injection-safe CSV export).
- **Live Express Phase 5 Runtime (`/server/`)**:
  - Added `/api/v1/conversations` (filtered listing, transcript view, resolve/reopen status updates, and formula-escaped UTF-8 BOM CSV export).
  - Added `/api/v1/analytics/overview` (zero-filled daily conversation/message/token time series, per-chatbot breakdown, top visitor questions, and unanswered prompts) and `/api/v1/usage/summary` (monthly quota bars & per-model usage).
  - Added `/api/v1/admin` routes (`GET /chatbots`, `PATCH /chatbots/:id/status`, `GET /ai-usage`, `GET /conversations`, `GET /conversations/:id`) restricted strictly to `SuperAdmin`.
- **Frontend Modules (`/src/`)**:
  - Added `conversationsService.js`, `analyticsService.js`, `adminMonitoringService.js`, and shared `ConversationTranscriptDialog.jsx`.
  - Added Business Portal pages `ConversationsPage.jsx` (`/app/conversations`), `AnalyticsPage.jsx` (`/app/analytics`), and `UsageStatsPage.jsx` (`/app/usage`) with Recharts visualizations.
  - Added Super Admin pages `AdminChatbotsPage.jsx` (`/admin/chatbots`), `AdminAiUsagePage.jsx` (`/admin/ai-usage`), and `AdminConversationsPage.jsx` (`/admin/conversations`).

## [0.4.0] - 2026-11-24 — Phase 4: Embeddable JavaScript Chat Widget & Cross-Domain Integration

### Added
- **SQL Server Phase 4 Scripts (`/database/sqlserver/`)**:
  - `008_Phase4_WidgetAndDomains.sql`: Added `WidgetPosition`, `WidgetTitle`, `WidgetSubtitle`, `LauncherLabel`, and `ShowCitations` to `dbo.ChatbotSettings` plus covering indexes on `AllowedDomains`, `Conversations`, and `Messages`.
  - `009_StoredProcedures_Phase4.sql`: Added parameterized stored procedures `usp_AllowedDomains_ListByChatbot`, `usp_AllowedDomains_Add`, `usp_AllowedDomains_Delete`, `usp_ChatbotSettings_UpdateWidgetAppearance`, `usp_Widget_GetConfigByPublicId`, `usp_Widget_CheckMonthlyQuota`, `usp_Widget_GetOrCreateConversation`, `usp_Widget_ListMessagesBySession`, and `usp_Widget_InsertConversationTurn`.
- **ASP.NET Core 8 Phase 4 Layer (`/backend-dotnet/ChatPilot.API/`)**:
  - Added `WidgetEntities.cs`, `WidgetDtos.cs`, `IWidgetInterfaces.cs`, `WidgetRepository.cs`, `WidgetService.cs`, `DomainsController.cs`, and `WidgetController.cs`.
- **Live Express Widget & Allowlist Runtime (`/server/`)**:
  - Added `server/services/domainAllowlistService.ts` for hostname/wildcard normalization (`*.example.com`) and strict per-request Origin/Referer validation.
  - Added `server/routes/domains.ts` (`/api/v1/chatbots/:chatbotId/domains`) and `PUT /api/v1/chatbots/:id/widget-settings`.
  - Added `server/routes/widget.ts` (`/api/v1/widget/:publicId/config`, `/history`, `/chat`) with dynamic CORS headers, IP rate limiting, monthly message quota checks, Phase 3 RAG + Gemini responses, and transactional `Conversations`, `Messages`, and `UsageLogs` persistence.
  - Added `server/widgetScript.ts` served at `GET /widget.js`: zero-dependency Vanilla JS Shadow DOM widget with XSS-safe DOM rendering (`createElement` + `textContent`), mobile/desktop responsive panel, session history resume, citations, and optional human handover CTA.
- **Frontend Widget Integration Module (`/src/`)**:
  - Added `widgetService.js`, `widgetSchemas.js`, and `WidgetIntegrationPage.jsx` replacing the `/app/widget` placeholder with embed snippets (HTML, React/Next.js, WordPress, Shopify, ASP.NET Core), Allowed Domains CRUD, Widget Appearance customization, and an in-page Live Widget tester.

## [0.3.0] - 2026-11-24 — Phase 3: Knowledge Base, Ingestion & RAG Pipeline

### Added
- **SQL Server Phase 3 Scripts (`/database/sqlserver/`)**:
  - `006_Phase3_KnowledgeBaseAndRag.sql`: Extended `dbo.KnowledgeSources` (`RawText`, `FaqQuestion`, `FaqAnswer`, `FileName`, `FileSizeBytes`, `ChunkCount`, `TotalTokens`, `LastIndexedOn`), enforced status/type constraints, and added covering indexes on `KnowledgeSources` and `KnowledgeChunks`.
  - `007_StoredProcedures_Phase3.sql`: Added parameterized stored procedures `usp_KnowledgeSources_ListByChatbot`, `usp_KnowledgeSources_GetById`, `usp_KnowledgeSources_Create`, `usp_KnowledgeSources_UpdateContent`, `usp_KnowledgeSources_SetStatus`, `usp_KnowledgeChunks_DeleteBySource`, `usp_KnowledgeChunks_Insert`, `usp_KnowledgeChunks_ListForRetrieval`, `usp_KnowledgeSources_Delete`, and `usp_KnowledgeStats_ByChatbot`.
- **ASP.NET Core 8 Phase 3 Layer (`/backend-dotnet/ChatPilot.API/`)**:
  - Added `KnowledgeEntities.cs`, `KnowledgeDtos.cs`, `IKnowledgeInterfaces.cs`, `KnowledgeRepository.cs`, `KnowledgeServices.cs` (`DocumentExtractorService`, `WebsiteCrawlerService`, `RagService`, `KnowledgeService`), and `KnowledgeController.cs`.
  - Extended `GeminiService.cs` (`GenerateEmbeddingsAsync` via `gemini-embedding-2`) and `ChatbotService.cs` (RAG context retrieval + citations).
- **Live Express + RAG Runtime (`/server/`)**:
  - Added `server/services/documentExtractorService.ts` (PDF via `unpdf`, DOCX via `mammoth`, TXT/MD with magic-byte & 10 MB checks).
  - Added `server/services/websiteCrawlerService.ts` (HTML cleaning via `cheerio` with DNS/IP SSRF blocking and redirect validation).
  - Added `server/services/ragService.ts` (sentence-aware overlapping chunking, `gemini-embedding-2` batch vectorization, and cosine-similarity retrieval).
  - Added `server/routes/knowledge.ts` mounted at `/api/v1/chatbots/:chatbotId/sources` and upgraded `/api/v1/chatbots/:id/playground` with RAG grounding and citations.
- **Frontend Modules (`/src/`)**:
  - Added `knowledgeService.js`, `knowledgeSchemas.js`, `SourceChunksDialog.jsx`, `KnowledgeBasePage.jsx`, `DocumentUploadsPage.jsx`, `WebsiteSourcesPage.jsx`, and `FaqManagementPage.jsx`.
  - Updated `ChatbotPlaygroundPage.jsx` with a Knowledge Base RAG toggle and grounded citation breakdown, and `ChatbotsListPage.jsx` with quick Knowledge links.

## [0.2.0] - 2026-11-24 — Phase 2: Chatbot Creation, Configuration & Gemini Testing Playground

### Added
- SQL Server Phase 2 migration & stored procedures (`004`, `005`), ASP.NET Core 8 chatbot/Gemini stack, live Express Gemini playground & chatbot CRUD, and React/MUI Chatbot Management, Creation, Tabbed Configuration, and Testing Playground pages.

## [0.1.0] - 2026-11-24 — Phase 1: Foundation & Multi-Tenant Auth

### Added
- System architecture documentation, SQL Server Phase 1 tables/seeds/stored procedures, ASP.NET Core 8 API foundation, live Express + SQLite runtime, JWT + rotating refresh tokens, RBAC, Super Admin Console, and Business Customer Portal.
