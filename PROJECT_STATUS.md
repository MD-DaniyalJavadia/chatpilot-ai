# ChatPilot AI — Project Status

**Current Version:** `1.0.2`  
**Active Phase:** Phases 1–6 Complete + Production Readiness Audit Hardening  
**Platform Status:** Staging Ready / Production Audit Complete (External secrets required for live deployment; see `PRODUCTION_READINESS_REPORT.md`)

## Phase Tracker

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Architecture, DB Foundation, ASP.NET Core & Live Express API, JWT + Refresh Rotation, Registration/Login, RBAC, Dashboard Layouts, Light/Dark Mode | **Completed** |
| Phase 2 | Chatbot CRUD, Subscription Limit Enforcement, Tabbed Configuration, Google Gemini Backend Service, Interactive Testing Playground | **Completed** |
| Phase 3 | Knowledge Base (PDF/DOCX/TXT/URL/FAQ/Manual), SSRF-Safe Web Crawler, Text Chunking, Gemini Embeddings (`gemini-embedding-2`), Cosine Vector Retrieval & RAG Grounding | **Completed** |
| Phase 4 | Embeddable Vanilla JS Widget (`/widget.js`), Shadow DOM UI, SSE Token Streaming, Domain Allowlisting, Dynamic CORS, Public Cross-Domain Chat, Conversation Persistence | **Completed** |
| Phase 5 | Conversation Management, Formula-Safe CSV Export, Recharts Analytics, Quota Usage Statistics, Super Admin Global Chatbot & AI/Conversation Monitoring | **Completed** |
| Phase 6 | Subscription Plans CRUD, Modular Payment Gateways, Tenant Checkout/Cancellation, Support Tickets, Live System Settings & AI Provider Catalog Enforcement | **Completed** |
| Production Readiness Audit | Security & SSRF hardening, billing reconciliation/expiry enforcement, session revocation, widget allowlist fix, responsive UI polish, isolated E2E verification | **Completed** |

## Phase 6 & Audit Deliverables Verified

- [x] SQL Server Phase 6 migration (`012_Phase6_BillingTicketsAndSettings.sql`) and 10 stored procedures (`013_StoredProcedures_Phase6.sql`)
- [x] SQLite runtime Phase 6 schema (`SupportTickets`, `SupportTicketMessages`, `SystemSettings`, `SubscriptionPlans.Description`, billing/ticket covering indexes, default seeds, WAL + `busy_timeout = 5000`)
- [x] ASP.NET Core 8 Phase 6 stack (`Phase6Entities`, `Phase6Dtos`, `IPhase6Interfaces`, `Phase6Repository`, `Phase6Services`, `BillingController`, `TicketsController`, `PlatformConfigController`)
- [x] Live Express Phase 6 stack (`paymentGatewayService.ts`, `billing.ts`, `tickets.ts`, `settings.ts`, `AllowPublicRegistration` enforcement in `auth.ts`)
- [x] Live `SystemSettings` & `AIProviders` runtime enforcement (Maintenance Mode banner, registration lock UI, dynamic widget rate limiting, `ConversationRetentionDays` purge, database-backed AI provider/model catalog checks) and SSE streaming widget chat
- [x] Super Admin commercial operations: Subscription Plans CRUD (`/admin/plans`), Subscription Management (`/admin/subscriptions`), Payment Reconciliation (`/admin/payments`), Support Tickets Queue (`/admin/tickets`), System Settings (`/admin/system-settings`), and AI Provider Config (`/admin/ai-providers`)
- [x] Business Customer Portal billing & support: Subscription & Billing Checkout/History (`/app/subscription`) and Support Ticket Threading (`/app/support`)
- [x] Production Readiness Audit (`PRODUCTION_READINESS_REPORT.md` & `walkthrough.md`): IPv6/mapped SSRF defense, headerless domain allowlist enforcement, pending-invoice subscription isolation, `ExpiresOn` enforcement, `SandboxCard` production gate, refresh token revocation on security mutations, and mobile UI fixes
