# ChatPilot AI — System Architecture & Engineering Blueprint

## 1. Overall System Architecture

ChatPilot AI is a multi-tenant AI Chatbot SaaS platform engineered with strict tenant data isolation (`BusinessId`), role-based access control (`SuperAdmin`, `BusinessOwner`, `BusinessAdmin`, `BusinessStaff`), RAG knowledge ingestion powered by Google Gemini, and a cross-domain embeddable JavaScript chat widget.

```
+-----------------------------------------------------------------------+
|                         CLIENT INTERFACES                             |
|                                                                       |
|  1. SaaS Web App (React + Vite + Material UI + Recharts)              |
|     - Super Admin Console (/admin/*)                                  |
|     - Business Customer Portal (/app/*)                               |
|  2. Embeddable JS Widget (widget.js on Third-Party Websites)          |
|     - WordPress / Shopify / HTML / React / ASP.NET                    |
+-----------------------------------+-----------------------------------+
                                    | HTTPS (JSON + JWT / Public Widget Key)
                                    v
+-----------------------------------------------------------------------+
|                        API & SECURITY LAYER                           |
|  - Exception Handling & Structured Error Responses                    |
|  - Rate Limiting (Auth, API, Public Widget)                           |
|  - JWT Bearer Auth + Rotating Refresh Tokens (In-Memory Client)       |
|  - RBAC Policy Enforcement & TenantContextMiddleware (BusinessId)     |
|  - Domain Allowlist & CORS Policy Enforcement                         |
+-----------------------------------+-----------------------------------+
                                    |
          +-------------------------+-------------------------+
          v                                                   v
+-----------------------------+               +-----------------------------+
|     CORE SAAS SERVICES      |               |    AI & RAG PIPELINE        |
|                             |               |    (Phases 2 - 4)           |
| - AuthService               |               | - DocumentExtractor         |
| - BusinessService           |               | - WebCrawlerService         |
| - SubscriptionService       |               | - TextChunker & Embedder    |
| - ChatbotService            |               | - VectorRetrievalService    |
| - ConversationService       |               | - GeminiChatService         |
| - AuditLogService           |               |   (Server-side API Key)     |
+--------------+--------------+               +--------------+--------------+
               |                                             |
               v                                             v
+-----------------------------------------------------------------------+
|                  PERSISTENCE & REPOSITORY LAYER                       |
|  - Target Enterprise Stack: ASP.NET Core 8 + Dapper + SQL Server      |
|    Stored Procedures (see /backend-dotnet & /database/sqlserver)      |
|  - Live Preview Runtime: Express.js + Node SQLite (server.ts)         |
|    mirroring the exact relational schema & API contracts on Port 3000 |
+-----------------------------------------------------------------------+
```

> **Runtime Alignment Note:** Because the AI Studio preview container runs Node.js v22 without a .NET SDK or SQL Server instance, **Phase 1** delivers both:
> 1. **Live Full-Stack Runtime (`server.ts` + `server/` + `data/chatpilot.db`)** serving the React frontend and real REST APIs (`/api/v1/*`) on port 3000 with `scrypt` password hashing, JWT + rotating refresh tokens, RBAC, and SQLite persistence.
> 2. **ASP.NET Core 8 & SQL Server Foundation (`/backend-dotnet/ChatPilot.API/` + `/database/sqlserver/`)** implementing the exact C# Controllers, Services, Interfaces, Dapper Repositories, Middleware, DTOs, and T-SQL Stored Procedures.

---

## 2. Frontend & Backend Folder Structures

### Frontend (`/src/` — React + Vite + JavaScript + Material UI)
```
src/
├── components/
│   ├── common/          # StatCard, DataTable, ConfirmDialog, PhasePlaceholderPage
│   └── navigation/      # SidebarNav, TopBar
├── context/
│   ├── AuthContext.jsx  # In-memory JWT & user/business session state
│   └── ThemeContext.jsx # Light/Dark MUI + Tailwind theme synchronization
├── hooks/
│   ├── useAuth.js
│   └── useThemeMode.js
├── layouts/
│   ├── AuthLayout.jsx
│   └── DashboardLayout.jsx
├── pages/
│   ├── auth/            # LoginPage, RegisterPage
│   ├── admin/           # SuperAdminDashboardPage, BusinessesManagementPage, UsersManagementPage, AuditLogsPage
│   ├── business/        # BusinessDashboardPage, BusinessProfilePage, TeamMembersPage
│   └── shared/          # AccountSettingsPage
├── routes/
│   ├── ProtectedRoute.jsx
│   └── AppRoutes.jsx
├── services/
│   ├── apiClient.js     # Axios instance + Bearer token + 401 refresh rotation queue
│   ├── authService.js
│   ├── businessService.js
│   ├── dashboardService.js
│   └── userService.js
├── utils/
│   └── formatters.js
├── validations/
│   ├── authSchemas.js   # Yup schemas
│   └── businessSchemas.js
├── App.jsx
├── index.css
└── main.jsx
```

### Backend Target (`/backend-dotnet/ChatPilot.API/` — ASP.NET Core 8 + Dapper)
```
backend-dotnet/ChatPilot.API/
├── Configuration/       # JwtSettings.cs
├── Controllers/         # AuthController, BusinessesController, UsersController, DashboardController
├── DTOs/                # AuthDtos, BusinessDtos, DashboardDtos, CommonDtos
├── Helpers/             # PasswordHasher.cs, ApiResponse.cs
├── Interfaces/          # IAuthService, IJwtTokenService, IBusinessService, IDashboardService, Repositories
├── Middleware/          # ExceptionHandlingMiddleware.cs, TenantContextMiddleware.cs
├── Models/              # User, Role, Business, BusinessUser, RefreshToken, SubscriptionPlan, Subscription, AuditLog
├── Repositories/        # UserRepository, BusinessRepository, DashboardRepository, AuditLogRepository
├── Services/            # AuthService, JwtTokenService, BusinessService, DashboardService
├── appsettings.json
├── ChatPilot.API.csproj
└── Program.cs
```

### SQL Server Scripts (`/database/sqlserver/`)
```
database/sqlserver/
├── 001_CreateTables.sql
├── 002_SeedData.sql
└── 003_StoredProcedures_Phase1.sql
```

---

## 3. Database Relationship Design (Normalized 3NF)

All tables use `IDENTITY(1,1)` surrogate primary keys, explicit foreign keys, and `CreatedOn` / `UpdatedOn` UTC audit timestamps.

| Table | Primary Key | Key Relationships | Purpose |
|---|---|---|---|
| `Roles` | `RoleId` | — | `SuperAdmin`, `BusinessOwner`, `BusinessAdmin`, `BusinessStaff` |
| `Users` | `UserId` | Unique `Email` | Platform & tenant user accounts, `PasswordHash` |
| `UserRoles` | `UserRoleId` | FK `UserId`, FK `RoleId` | Global platform role assignment |
| `RefreshTokens` | `RefreshTokenId` | FK `UserId` | SHA-256 hashed refresh tokens, rotation & revocation chain |
| `Businesses` | `BusinessId` | Unique `Slug`, `Status` | Tenant organizations (`Active`, `Suspended`, `Deactivated`) |
| `BusinessUsers` | `BusinessUserId` | FK `BusinessId`, FK `UserId`, FK `RoleId` | Maps users to tenant businesses with tenant role |
| `SubscriptionPlans` | `PlanId` | Unique `Code` | `Free`, `Starter`, `Professional`, `Enterprise` limits & pricing |
| `Subscriptions` | `SubscriptionId` | FK `BusinessId`, FK `PlanId` | Active/expired tenant subscription & billing cycle |
| `Payments` | `PaymentId` | FK `BusinessId`, FK `SubscriptionId` | Billing records & gateway transaction references |
| `Chatbots` | `ChatbotId` | FK `BusinessId`, Unique `PublicId` | Tenant AI chatbots & public embed identifier |
| `ChatbotSettings` | `SettingId` | FK `ChatbotId` (1:1) | Model, instructions, tone, brand color, handover config |
| `KnowledgeSources` | `SourceId` | FK `ChatbotId`, FK `BusinessId` | Uploaded files, URLs, FAQs, ingestion status |
| `KnowledgeChunks` | `ChunkId` | FK `SourceId`, FK `ChatbotId`, FK `BusinessId` | Normalized text chunks & vector embeddings |
| `Conversations` | `ConversationId` | FK `ChatbotId`, FK `BusinessId` | Visitor chat sessions & resolution state |
| `Messages` | `MessageId` | FK `ConversationId`, FK `BusinessId` | User/AI turns, token counts, latency |
| `UsageLogs` | `UsageLogId` | FK `BusinessId`, FK `ChatbotId` | Daily/monthly AI token & message metering |
| `ApiKeys` | `ApiKeyId` | FK `BusinessId` | Scoped server integration keys (hashed) |
| `AllowedDomains` | `AllowedDomainId` | FK `ChatbotId`, FK `BusinessId` | Domain allowlist for widget CORS/origin verification |
| `SupportTickets` | `TicketId` | FK `BusinessId`, FK `UserId` | Tenant support requests |
| `AuditLogs` | `AuditLogId` | FK `UserId` (nullable), FK `BusinessId` (nullable) | Security & operational audit trail |

---

## 4. API Architecture (`/api/v1/*`)

### Phase 1 Endpoints (Implemented & Live)
- `GET /api/v1/health` — Service health & database readiness check.
- `GET /api/v1/auth/bootstrap-status` — Checks whether a Super Admin has been initialized.
- `POST /api/v1/auth/claim-super-admin` — One-time first-run Super Admin creation (locks after claim).
- `POST /api/v1/auth/register` — Registers a Business Owner + Business tenant + Free Subscription.
- `POST /api/v1/auth/login` — Authenticates email/password; returns access JWT + rotating refresh token.
- `POST /api/v1/auth/refresh` — Rotates refresh token; revokes family on reuse detection.
- `POST /api/v1/auth/logout` — Revokes current refresh token.
- `GET /api/v1/auth/me` — Returns current authenticated user, role, business context.
- `GET /api/v1/dashboard/super-admin` — `[SuperAdmin]` Platform-wide real DB metrics & recent activity.
- `GET /api/v1/businesses` — `[SuperAdmin]` Search, filter, paginate businesses.
- `PATCH /api/v1/businesses/:id/status` — `[SuperAdmin]` Activate / Deactivate / Suspend business.
- `GET /api/v1/users` — `[SuperAdmin]` Search, filter, paginate platform users.
- `PATCH /api/v1/users/:id/status` — `[SuperAdmin]` Activate / Deactivate user account.
- `GET /api/v1/dashboard/business` — `[Business Roles]` Tenant-isolated metrics & plan limits.
- `GET /api/v1/business/profile` — `[Business Roles]` Fetch current tenant profile.
- `PUT /api/v1/business/profile` — `[BusinessOwner, BusinessAdmin]` Update current tenant profile.
- `GET /api/v1/business/team` — `[BusinessOwner, BusinessAdmin]` List members of current tenant.
- `POST /api/v1/business/team` — `[BusinessOwner, BusinessAdmin]` Add `BusinessAdmin` or `BusinessStaff` member.
- `PUT /api/v1/account/profile` — `[Authenticated]` Update own full name.
- `PUT /api/v1/account/password` — `[Authenticated]` Verify current password and rotate to new hash.
- `GET /api/v1/audit-logs` — `[SuperAdmin | BusinessOwner | BusinessAdmin]` Scoped audit logs.

### Phases 2–6 Endpoints (Architected)
- **Phase 2**: `/api/v1/chatbots/*`, `/api/v1/chatbots/:id/settings`, `/api/v1/chatbots/:id/domains`
- **Phase 3**: `/api/v1/chatbots/:id/sources/*`, `/api/v1/chatbots/:id/faqs/*`, `/api/v1/chatbots/:id/playground`
- **Phase 4**: `/api/v1/widget/:publicId/config`, `/api/v1/widget/:publicId/chat` (streaming + CORS/domain verification)
- **Phase 5**: `/api/v1/conversations/*`, `/api/v1/analytics/*`
- **Phase 6**: `/api/v1/plans/*`, `/api/v1/subscriptions/*`, `/api/v1/payments/*`, `/api/v1/tickets/*`, `/api/v1/settings/*`

---

## 5. Authentication & Authorization Strategy

1. **Password Security**: Server-side `scrypt` (Node runtime) / `BCrypt` (ASP.NET Core) with random per-user salts and constant-time comparison (`timingSafeEqual`).
2. **JWT Access Tokens**: Short-lived (15 min) HMAC-SHA256 signed JWT containing `sub` (`UserId`), `email`, `role`, `businessId`, `jti`, `iat`, `exp`.
3. **Refresh Token Rotation**: Cryptographically random 48-byte tokens stored in `RefreshTokens` as SHA-256 digests (`TokenHash`). Every `/refresh` call issues a new refresh token, marks the prior token revoked with `ReplacedByTokenHash`, and invalidates all active tokens for that user if a revoked token is replayed.
4. **Client Token Handling**: Tokens are stored strictly in React memory (`AuthContext`), never in `localStorage` or `sessionStorage`, eliminating XSS token theft via web storage.
5. **RBAC**:
   - `SuperAdmin`: Full platform administration across all businesses, plans, users, and audit logs.
   - `BusinessOwner`: Full control over their own `BusinessId` (profile, team, billing, chatbots, knowledge, conversations).
   - `BusinessAdmin`: Manages assigned business resources (profile, team staff, chatbots, knowledge, conversations).
   - `BusinessStaff`: Restricted operational access to permitted chatbots and conversations inside their `BusinessId`.

---

## 6. Multi-Tenant Security Strategy

1. **JWT-Derived Tenant Context**: `BusinessId` is never trusted from client request bodies or query strings on tenant endpoints; it is resolved exclusively from the verified JWT + `BusinessUsers` database membership on every request.
2. **Suspended/Deactivated Enforcement**: If a business status is `Suspended` or `Deactivated`, tenant API requests and login attempts for that business are rejected with `403 Forbidden`.
3. **Parameterized Data Access**: Every SQLite prepared statement and SQL Server stored procedure binds `@BusinessId` explicitly in `WHERE` clauses.
4. **Rate Limiting & Abuse Prevention**: IP-keyed sliding-window rate limiters protect `/api/v1/auth/*` endpoints against credential stuffing.
5. **Audit Trail**: Every registration, login, status change, team addition, and profile mutation writes an immutable row to `AuditLogs`.

---

## 7. Development Phase Breakdown

- **Phase 1 (Current — Foundation & Auth)**: Project setup, React + MUI + Router + Axios + Hook Form + Yup foundation, ASP.NET Core 8 + Dapper + SQL Server scripts, live Express + SQLite API mirror, JWT + Refresh Token rotation, User Registration & Login, First-Run Super Admin claim, RBAC, Light/Dark modes, Super Admin & Business Customer dashboard layouts.
- **Phase 2 (Chatbot Core & Playground)**: Chatbot CRUD, subscription limit enforcement, ChatbotSettings customization, Gemini API server-side integration, testing playground.
- **Phase 3 (Knowledge Base & RAG Pipeline)**: PDF/DOCX/TXT upload validation, website crawler with SSRF protection, FAQ & manual text ingestion, chunking, Gemini embeddings, vector similarity retrieval, grounded RAG answering.
- **Phase 4 (Embeddable JS Chat Widget)**: Standalone `widget.js`, public chatbot config endpoint, domain allowlist & CORS enforcement, floating responsive chat UI, real-time messaging & history.
- **Phase 5 (Conversations & Recharts Analytics)**: Conversation search/filter/resolution/export, unanswered question tracking, Recharts dashboards (daily/monthly conversations, token usage, chatbot performance).
- **Phase 6 (Subscriptions, Billing & Operations)**: Super Admin plan management, modular payment gateway adapter, usage metering & enforcement, support tickets, AI provider settings.
