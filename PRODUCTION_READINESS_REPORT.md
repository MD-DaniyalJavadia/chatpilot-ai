# ChatPilot AI — Production Readiness Audit Report

**Audit Date:** 2026-11-25  
**Audited Version:** `1.0.2` (Phases 1–6 Complete + Pre-Launch Hardening)  
**Target Environment Evaluated:** Live Express + Node SQLite (`server.ts`) & React 19 / Vite 8 / MUI 9 frontend (`src/`), plus static code audit of ASP.NET Core 8 (`backend-dotnet/`) and SQL Server (`database/sqlserver/`) scripts.

---

## 1. Overall Application Status

**Status:** **Staging Ready / Conditional Go for Commercial Launch**

ChatPilot AI’s end-to-end multi-tenant SaaS implementation across all 6 planned phases is **functionally complete**, cleanly architected, and backed by verified database persistence, role-based access control, strict `BusinessId` tenant isolation, RAG ingestion/retrieval, an embeddable Shadow DOM widget (`/widget.js`) with SSE streaming, commercial billing plans/checkouts, support ticketing, and live system settings enforcement.

All security, entitlement, session revocation, and responsive UI defects uncovered during this audit in the live Express + SQLite + React application have been fixed and verified via `npm run build`, TypeScript linting (`tsc --noEmit`), dependency auditing (`bun audit`: 430 packages, 0 vulnerabilities), live HTTP smoke tests, and an automated isolated E2E security/regression suite.

Commercial production launch remains **gated only on infrastructure & credential provisioning** detailed in Sections 7 and 8 (specifically setting `GEMINI_API_KEY`, a persistent `JWT_ACCESS_SECRET`, `STRIPE_SECRET_KEY` + automated Stripe webhook reconciliation if Stripe Checkout is enabled, and deploying/verifying the ASP.NET Core 8 + SQL Server stack if targeting SQL Server instead of single-node SQLite).

---

## 2. Completed and Verified Modules

Every route, frontend page, and backend service was inspected against actual source files and verified end-to-end where runtime dependencies allow:

- **Authentication, Session & RBAC Core** (`server/routes/auth.ts`, `server/middleware/auth.ts`, `server/utils/crypto.ts`, `src/context/AuthContext.jsx`, `LoginPage.jsx`, `RegisterPage.jsx`, `AccountSettingsPage.jsx`):
  - `scrypt` salted password hashing with `crypto.timingSafeEqual` verification.
  - 15-minute HS256 JWT access tokens strictly kept in React memory (`AuthContext.jsx`), paired with rotating SHA-256 hashed 48-byte `RefreshTokens` and automatic family revocation on token replay.
  - One-time first-run Super Admin claim (`POST /api/v1/auth/claim-super-admin`) with atomic transaction lock and optional `SUPER_ADMIN_PASSCODE` guard.
  - Verified revocation of active `RefreshTokens` upon password rotation, user deactivation, and business workspace suspension/deactivation.
- **Multi-Tenant Workspace & Team Administration** (`server/routes/businesses.ts`, `server/routes/users.ts`, `server/routes/dashboard.ts`):
  - All tenant routes resolve `BusinessId` from the database via authenticated JWT (`getUserAuthContextById`), blocking suspended/deactivated workspaces (`403`) and scoping `AuditLogs` strictly by tenant.
  - Super Admin dashboards, business moderation, user moderation, and global audit log viewer verified.
- **Chatbot Lifecycle & Prompt Builder** (`server/routes/chatbots.ts`, `server/services/promptBuilder.ts`, `ChatbotsListPage.jsx`, `CreateChatbotPage.jsx`, `ChatbotConfigPage.jsx`, `ChatbotPlaygroundPage.jsx`):
  - CRUD lifecycle with `PublicId` generation, dynamic `AIProviders` active catalog & model validation, subscription `MaxChatbots` quota enforcement, and Playground chat integration.
  - Fixed `ChatbotConfigPage.jsx` so switching `aiProvider` automatically aligns `aiModel` to the provider's first enabled model.
- **Knowledge Base & RAG Pipeline** (`server/routes/knowledge.ts`, `server/services/documentExtractorService.ts`, `server/services/websiteCrawlerService.ts`, `server/services/ragService.ts`):
  - File ingestion with magic-byte verification (PDF via `unpdf`, DOCX via `mammoth`, TXT/MD up to 10 MB), FAQ & manual entries, SSRF-hardened website crawler, sentence-aware overlapping chunker (`chunkText`), and vector similarity + lexical retrieval.
  - Cleanly handles unconfigured `GEMINI_API_KEY` (`HTTP 503` + `Failed` source record for one-click reindexing once the key is added).
- **Embeddable Cross-Domain Widget & Domain Allowlist** (`server/widgetScript.ts`, `server/routes/widget.ts`, `server/routes/domains.ts`, `server/services/domainAllowlistService.ts`, `WidgetIntegrationPage.jsx`):
  - Zero-dependency Shadow DOM `/widget.js` script using XSS-safe `createElement` + `textContent` rendering, URL scheme validation (`http:`/`https:` and strict email regex for `mailto:` handover), mobile `100dvh` panel sizing, conversation history resume, citations, and SSE streaming (`event: meta | chunk | done | error`) with JSON fallback.
  - Strict dynamic CORS and `AllowedDomains` enforcement (including wildcard subdomains `*.example.com` and newly blocked headerless bypasses when allowlist rules are present).
  - Non-sensitive `/config` endpoint confirmed never to expose `systemInstructions`, internal prompts, or tenant IDs.
- **Conversation Analytics, Export & Super Admin Monitoring** (`server/routes/conversations.ts`, `server/routes/analytics.ts`, `server/routes/admin.ts`, `ConversationsPage.jsx`, `AnalyticsPage.jsx`, `UsageStatsPage.jsx`, `AdminChatbotsPage.jsx`, `AdminAiUsagePage.jsx`, `AdminConversationsPage.jsx`):
  - Filtering, transcript drawer, resolution toggling, UTF-8 BOM CSV export with spreadsheet formula-injection prefix escaping (`=`, `+`, `-`, `@`, tab, CR), Recharts daily telemetry, unanswered prompt tracking, and monthly quota usage meters.
- **Commercial Billing, Plans, Support Tickets & System Settings** (`server/routes/billing.ts`, `server/routes/tickets.ts`, `server/routes/settings.ts`, `server/services/paymentGatewayService.ts`):
  - Super Admin Plans CRUD, Tenant Billing & Plan Checkout (`SandboxCard` gated in production, `ManualInvoice` creating `PastDue` + `Pending` until reconciled, and `Stripe` PaymentIntent creation via server env), Support Ticket multi-turn threads, and live `SystemSettings` enforcement (`AllowPublicRegistration`, `MaintenanceMode`, `DefaultTrialDays`, `DefaultWidgetRateLimitPerMin`, `ConversationRetentionDays` auto-purge, `SupportContactEmail`).

---

## 3. Incomplete or Broken Modules (Status & Resolutions)

- **Orphaned Placeholder Artifact Removed:** Found unused `src/components/common/PhasePlaceholderPage.jsx` with zero references across `src/`. Removed it; every navigation route in `src/routes/AppRoutes.jsx` renders a full functional page.
- **Billing Pending-Settlement & Expiry Gaps (Fixed in Node Runtime):**
  - Previously, selecting `ManualInvoice` or initializing an unconfirmed Stripe PaymentIntent prematurely cancelled the tenant's existing active plan and created a new row without promoting `PastDue` -> `Active` upon Super Admin payment reconciliation. Fixed inside database transactions in `server/routes/billing.ts`.
  - Previously, quota queries (`widget.ts`, `chatbots.ts`, `businesses.ts`, `knowledge.ts`, `analytics.ts`, `dashboard.ts`, `admin.ts`, `billing.ts`) checked `Status = 'Active'` without validating `(ExpiresOn IS NULL OR ExpiresOn > now)`. Updated across all runtime queries so expired subscriptions seamlessly fall back to `FREE` plan limits.
- **Stripe Automated Webhook Settlement (Not Yet Implemented):** `StripeGateway` creates a real server-side Stripe `PaymentIntent` (`Pending` state), and Super Admins can mark payments `Succeeded` via `/admin/payments`. However, there is no automated `POST /api/v1/webhooks/stripe` endpoint with `Stripe-Signature` HMAC verification yet (recommended prior to unattended self-serve Stripe card upgrades).
- **ASP.NET Core 8 + SQL Server Parity:** `/backend-dotnet/ChatPilot.API/` and `/database/sqlserver/` cannot be compiled or executed inside the Node.js preview environment. Before deploying the `.NET` target in production, apply parity updates to mirror the Node hardening patches (IPv6 bracket SSRF normalization, headerless allowlist blocking when domains exist, pending-invoice subscription isolation, `SandboxCard` production opt-in gate, and `RefreshTokens` revocation on suspension/password reset).

---

## 4. Security Vulnerabilities & Remediations

The following vulnerabilities and hardening gaps were discovered and remediated during the audit (detailed PoC verification traces are provided in `walkthrough.md`):

| Severity | Finding | Resolution Applied |
|---|---|---|
| **High** | Bracketed and mapped/ULA IPv6 SSRF bypasses (`[::1]`, `[::ffff:127.0.0.1]`, `[::ffff:7f00:1]`, `[fe90::1]`, `[fc00::1]`) in `websiteCrawlerService.ts` | Stripped IPv6 brackets and added full 16-bit block parser rejecting loopback, private IPv4-mapped/compatible, NAT64, ULA, link-local, multicast, and documentation prefixes. |
| **High** | Widget requests missing both `Origin` and `Referer` bypassed `AllowedDomains` restrictions in `domainAllowlistService.ts` | Headerless requests now return `403 Forbidden` whenever a chatbot has one or more configured allowed domains. |
| **High** | Pending checkout flows (`ManualInvoice` / unconfirmed Stripe) could cancel an existing `Active` plan and leave settlement disconnected in `billing.ts` | Pending checkouts now create isolated `PastDue` rows without revoking active entitlements until reconciled by an administrator. |
| **High** | `SandboxCard` simulated checkout remained callable for paid plans even when `NODE_ENV === 'production'` | Blocked paid `SandboxCard` checkout when `NODE_ENV === 'production'` unless `ENABLE_SANDBOX_BILLING=true`; hidden automatically in production UI. |
| **Medium** | `verifyJwt` in `crypto.ts` did not explicitly reject header `alg`/`typ` mismatches or invalid `sub` claims | Added explicit `header.alg === 'HS256'`, `header.typ === 'JWT'`, and positive integer `sub` checks. |
| **Medium** | Active `RefreshTokens` were not revoked on password change, user deactivation, or business suspension | Wrapped all three mutations in SQLite transactions setting `RevokedOn` across all open refresh tokens for affected accounts. |
| **Low** | Missing HTTP security headers (`x-powered-by` exposed) and weak `mailto:` validation in `widgetScript.ts` | Disabled `x-powered-by`, added `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy` (omitting `X-Frame-Options` for embed/iframe compatibility), and validated email syntax prior to assigning `mailto:`. |

**Remaining Advisory:** Outbound HTTP crawling validates resolved DNS IPs immediately prior to each request/redirect hop; because Node’s built-in `fetch()` performs socket connection independently of `dns.lookup()`, deployments facing hostile DNS environments should route crawler egress through an isolated outbound proxy or pin socket IPs via a custom `undici` dispatcher to eliminate TOCTOU DNS rebinding windows.

---

## 5. Performance & Reliability Issues

- **SQLite Lock Contention (`server/db.ts`):** Added `PRAGMA busy_timeout = 5000;` alongside `journal_mode = WAL` and `foreign_keys = ON` to prevent immediate `SQLITE_BUSY` failures under concurrent widget/dashboard writes.
- **Rate Limiter Memory Growth (`server/middleware/rateLimit.ts`):** Added periodic expired-bucket cleanup (`setInterval().unref()`) plus threshold pruning (`buckets.size > 500`) so long-running processes do not leak memory across diverse visitor IPs.
- **Horizontal Scaling Note:** The preview backend uses single-node SQLite (`data/chatpilot.db`) and process-local rate-limit memory maps. Multi-instance horizontal scaling requires running against SQL Server (using `/backend-dotnet` + `/database/sqlserver`) and a shared store (e.g., Redis) for rate limiting.
- **Responsive UI Audit (`src/pages/business/*`, `server/widgetScript.ts`):**
  - Fixed fixed-width filter spillover on small mobile screens in `ConversationsPage.jsx` (`From`/`To` date fields now scale `100%` on `xs`).
  - Stacked the domain allowlist input + Add button cleanly on `xs` viewports in `WidgetIntegrationPage.jsx`.
  - Added dynamic viewport height fallback (`100dvh`) in `/widget.js` `@media (max-width: 480px)` so mobile browsers with dynamic address bars do not clip the input bar.

---

## 6. Testing Results

| Check / Suite | Scope | Result | Notes |
|---|---|---|---|
| `npm run build` (`compile_applet`) | Vite production bundle of React 19 + MUI 9 + Tailwind 4 frontend | **Passed** | Clean bundle generated into `dist/`. |
| TypeScript Check (`lint_applet` / `tsc --noEmit`) | All `.ts`/`.tsx` server modules and config | **Passed** | 0 type or syntax errors. |
| Dependency Security Audit (`bun audit`) | 430 installed packages (`bun.lock`) | **Passed** | 0 known vulnerabilities reported. |
| Isolated E2E & Security Harness (`npx tsx`) | Fresh temp SQLite DB + full Express router stack across 13 suites | **Passed (`ALL_AUDIT_TESTS_PASSED`)** | Verified SQLite pragmas, security headers, `/widget.js`, SuperAdmin claim lock, `alg:none` JWT rejection, cross-tenant `404` isolation (`chatbots`, `domains`, `sources`, `tickets`, `conversations`, `audit-logs`), headerless allowlist block, 10 SSRF vectors, `ManualInvoice` pending/settle/expiry quotas, registration lock, disabled AI provider block, CSV formula escaping, and refresh token revocation on password/status changes. |
| Production Sandbox Gate Test (`NODE_ENV=production`) | `isSandboxBillingEnabled()` & `executeSubscriptionCheckout` | **Passed (`SANDBOX_PROD_GATE_PASSED`)** | Verified paid `SandboxCard` checkout throws when running in production mode without explicit opt-in. |
| Live Server Smoke Tests (`curl` on `127.0.0.1:3000`) | `/api/v1/health`, `/widget.js`, `/` | **Passed** | Confirmed HTTP `200`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Resource-Policy: cross-origin`, and absence of `X-Powered-By` and `X-Frame-Options`. |
| Live Gemini Completions & Embeddings | Runtime response streaming & vector embedding generation | **Not Executed (Blocked by Missing Secret)** | `GEMINI_API_KEY` is not set in preview container; graceful HTTP `503` + `Failed` ingestion state verified instead. |
| Live Stripe PaymentIntent API & ASP.NET Core Build | External Stripe API + `.NET 8` / SQL Server stored procs | **Not Executed (Unprovisioned)** | `STRIPE_SECRET_KEY`, .NET SDK, and SQL Server instance are not present in this Node container. |

---

## 7. External Service Configurations Required

Configure these variables in the deployment secrets manager before commercial launch (`.env.example` documents non-secret templates):

1. **`GEMINI_API_KEY` (Required):** Google Gemini API key for server-side chat completions, Playground testing, SSE widget streaming, and `gemini-embedding-2` knowledge vectorization.
2. **`JWT_ACCESS_SECRET` (Required for Persistence):** Set a strong 32+ byte random string. Without it, the Node runtime generates an ephemeral key on startup, invalidating active JWTs on server restarts (already mandatory in ASP.NET Core `JwtSettings`).
3. **`SUPER_ADMIN_PASSCODE` (Strongly Recommended):** Protects initial `/api/v1/auth/claim-super-admin` bootstrap on a fresh production database.
4. **`STRIPE_SECRET_KEY` (Optional / Required for Live Card Checkout):** Enables live Stripe `PaymentIntent` creation in `/api/v1/subscription/checkout`.
5. **`ENABLE_SANDBOX_BILLING` (Leave unset or `false` in Production):** Only set to `true` in staging environments intentionally demoing `SandboxCard` without real charges.
6. **`APP_URL` & `SQLSERVER_CONNECTION_STRING`:** Required when setting canonical links or running the ASP.NET Core 8 + SQL Server enterprise backend.

---

## 8. Remaining Work Before Commercial Launch

1. **Provision Production Secrets:** Configure `GEMINI_API_KEY`, a persistent `JWT_ACCESS_SECRET`, `SUPER_ADMIN_PASSCODE`, and `APP_URL` in production secrets, then verify live Gemini completions, SSE streaming, and RAG indexing (`PDF`, `DOCX`, `URL`, `FAQ`).
2. **Complete Stripe Webhook Automation (If Using Stripe Self-Serve):** Implement a signed `POST /api/v1/webhooks/stripe` handler verifying `Stripe-Signature` to promote `payment_intent.succeeded` events automatically without waiting on Super Admin manual reconciliation.
3. **Sync Hardening Fixes into `/backend-dotnet` & `/database/sqlserver` (If Deploying .NET Stack):** Port the IPv6 bracket SSRF fixes, headerless domain allowlist enforcement, pending-invoice subscription isolation, `SandboxCard` production gate, and `RefreshTokens` revocation to the C# services/T-SQL stored procedures and run `dotnet test` / integration checks against SQL Server.
4. **Operational Backups & Monitoring:** Schedule automated WAL-safe SQLite backups (or SQL Server automated backups), run HTTPS termination behind a reverse proxy (Nginx/Cloudflare/ALB), and back rate limiters with Redis if scaling beyond a single Node instance.
