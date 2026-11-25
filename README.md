# ChatPilot AI — Multi-Tenant AI Chatbot SaaS Platform

ChatPilot AI is a commercial multi-tenant SaaS platform enabling businesses to register isolated workspaces, configure AI chatbots powered by Google Gemini, train them with PDF/DOCX/TXT documents, websites, and FAQs via Retrieval-Augmented Generation (RAG), test grounded answers in an interactive playground, and (in Phase 4) embed cross-domain chat widgets.

## Architecture Overview

- **Frontend (`/src/`)**: React 19 + Vite + JavaScript + Material UI v9 + React Router + Axios + React Hook Form + Yup + Recharts, supporting Light and Dark themes.
- **Live Preview Backend (`/server.ts`, `/server/`)**: Express + Node SQLite (`data/chatpilot.db`) + `@google/genai` running on port 3000, implementing the REST API contracts with `scrypt` password hashing, HMAC-SHA256 JWTs, rotating refresh tokens, RBAC, `BusinessId` tenant isolation, document/website ingestion, and Gemini embedding vector retrieval.
- **Enterprise Target Backend (`/backend-dotnet/ChatPilot.API/`)**: ASP.NET Core 8 Web API + Dapper + `HttpClient` Gemini service calling Microsoft SQL Server stored procedures.
- **SQL Server Scripts (`/database/sqlserver/`)**:
  - `001_CreateTables.sql` — 20 normalized tables (`IDENTITY(1,1)`, FKs, `CreatedOn`/`UpdatedOn`)
  - `002_SeedData.sql` — Roles & Subscription Plans (`Free`, `Starter`, `Professional`, `Enterprise`)
  - `003_StoredProcedures_Phase1.sql` — Phase 1 Auth, Tenant, User & Dashboard procedures
  - `004_Phase2_ChatbotsAndPlayground.sql` — `AIProviders` table + Phase 2 `Chatbots`/`ChatbotSettings` extensions
  - `005_StoredProcedures_Phase2.sql` — Phase 2 Chatbot CRUD, Configuration & Usage procedures
  - `006_Phase3_KnowledgeBaseAndRag.sql` — Phase 3 `KnowledgeSources`/`KnowledgeChunks` extensions & indexes
  - `007_StoredProcedures_Phase3.sql` — Phase 3 Knowledge ingestion, chunking & RAG retrieval procedures
  - `008_Phase4_WidgetAndDomains.sql` — Phase 4 widget branding columns & allowlist/conversation indexes
  - `009_StoredProcedures_Phase4.sql` — Phase 4 domain allowlist, public widget config, quota & chat persistence procedures
  - `010_Phase5_ConversationsAndAnalytics.sql` — Phase 5 covering indexes for analytics and conversation telemetry
  - `011_StoredProcedures_Phase5.sql` — Phase 5 conversation export, business analytics, quota summary, and Super Admin monitoring procedures
  - `012_Phase6_BillingTicketsAndSettings.sql` — Phase 6 support ticket threads, platform system settings, and billing covering indexes
  - `013_StoredProcedures_Phase6.sql` — Phase 6 plans CRUD, subscription switching, payments, tickets, and AI provider config procedures

## Environment Configuration

Configure secrets in your host environment (or **Settings > Secrets** in AI Studio):

- `GEMINI_API_KEY`: Required on the backend server for live Gemini completions (`gemini-4-*` / `gemini-3.1-flash-lite`) and RAG embeddings (`gemini-embedding-2`). Never exposed to frontend JavaScript.
- `APP_URL`: Public application URL for origin/link references.
- `SUPER_ADMIN_PASSCODE` *(optional)*: Server-side passcode required during first-run Super Admin setup if set.
- `JWT_ACCESS_SECRET` *(ASP.NET Core)*: Symmetric HMAC-SHA256 signing key (the Node preview generates a secure ephemeral secret automatically when unset).
- `SQLSERVER_CONNECTION_STRING` *(ASP.NET Core)*: Target Microsoft SQL Server connection string.
- `STRIPE_SECRET_KEY` *(optional)*: Server-side Stripe secret key when enabling live Stripe PaymentIntents in Subscription checkout.

## Phase 2, 3 & 4 API Endpoints

### Chatbots & Playground (`/api/v1/chatbots`)
- `GET /providers` — Active AI providers, supported Gemini models, and server key status
- `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id/status`, `DELETE /:id` — Tenant-isolated chatbot lifecycle & configuration
- `PUT /:id/widget-settings` — Update widget brand color, logo URL, position, header labels, citation visibility, and handover email
- `POST /:id/playground` — Rate-limited temporary Gemini testing chat with automatic RAG retrieval and citation output

### Knowledge Base & RAG (`/api/v1/chatbots/:chatbotId/sources`)
- `GET /`, `GET /:sourceId`, `POST /upload`, `POST /website`, `POST /faq`, `POST /manual`, `PUT /:sourceId`, `POST /:sourceId/reindex`, `DELETE /:sourceId`, `POST /search`

### Domain Allowlisting & Public Embeddable Widget
- `GET/POST /api/v1/chatbots/:chatbotId/domains`, `DELETE /api/v1/chatbots/:chatbotId/domains/:domainId` — Tenant-isolated allowlisted hostnames & wildcards
- `GET /widget.js` — Standalone Vanilla JS Shadow DOM embed script (`data-chatbot-id="<publicId>"`)
- `GET /api/v1/widget/:publicId/config` — Public branding & welcome configuration (CORS-enforced via `AllowedDomains`)
- `GET /api/v1/widget/:publicId/history` — Restore recent visitor session turns
- `POST /api/v1/widget/:publicId/chat` — Rate-limited, quota-checked, RAG-grounded live chat persisting `Conversations`, `Messages`, and `UsageLogs`

### Conversations, Analytics, Usage & Super Admin Monitoring
- `GET /api/v1/conversations`, `GET /api/v1/conversations/:id`, `PATCH /api/v1/conversations/:id/resolve`, `GET /api/v1/conversations/export` — Tenant-isolated transcript search, resolve/reopen, and formula-safe CSV export
- `GET /api/v1/analytics/overview`, `GET /api/v1/usage/summary` — Daily time-series telemetry, per-chatbot breakdowns, unanswered knowledge gaps, and plan quota utilization
- `GET /api/v1/admin/chatbots`, `PATCH /api/v1/admin/chatbots/:id/status`, `GET /api/v1/admin/ai-usage`, `GET /api/v1/admin/conversations`, `GET /api/v1/admin/conversations/:id` — Super Admin global moderation and cross-tenant monitoring

### Billing, Plans, Support Tickets & Platform Settings
- `GET/POST/PUT /api/v1/plans`, `PATCH /api/v1/plans/:id/status` — Subscription tier management
- `GET /api/v1/subscription`, `POST /api/v1/subscription/checkout`, `POST /api/v1/subscription/cancel` — Tenant billing summary, modular checkout, and cancellation
- `GET/PATCH /api/v1/admin/subscriptions*`, `GET/PATCH /api/v1/admin/payments*` — Super Admin subscription & payment reconciliation
- `GET/POST /api/v1/tickets`, `GET/POST /api/v1/tickets/:id*`, `GET/PATCH /api/v1/admin/tickets*` — Tenant-isolated support ticket threads and admin escalation queue
- `GET/PUT /api/v1/admin/settings`, `GET/PUT/PATCH /api/v1/admin/ai-providers*` — Global registration/rate-limit settings and AI model catalog management

## Running & Testing Locally

1. Install dependencies: `npm install`
2. Start the full-stack dev server on port 3000: `npm run dev`
3. Register a Business workspace at `/register` (or initialize Super Admin at `/login` on first run).
4. Create a chatbot under **My Chatbots**, ingest sources under **Knowledge Base**, configure allowed domains & branding under **Widget Integration**, and test the live embedded `/widget.js` drawer.
