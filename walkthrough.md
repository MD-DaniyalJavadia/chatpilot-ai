# Security Summary

**Reviewed Files**: 68 (Frontend React components/services/schemas, Express backend routes/services/middleware/widget, SQL Server migrations & stored procedures, and ASP.NET Core reference modules)  
**Issues Resolved**: 9  

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| IPv6 Crawler URL Filtering | `server/services/websiteCrawlerService.ts` | 44–160 | Bracketed IPv6 URLs (such as `http://[::1]/` and `http://[fe90::1]/`) were not consistently unwrapped or decoded by 16-bit network block, leaving internal IPv6 and mapped IPv4 targets reachable during knowledge ingestion. | High | Fixed | Stripped IPv6 brackets before hostname checks and added full 16-bit IPv6 block parsing (`parseIpv6ToWords`) blocking loopback, ULA, link-local, multicast, documentation, IPv4-compatible, IPv4-mapped, and NAT64 prefixes. |
| Widget Domain Allowlist Bypass | `server/services/domainAllowlistService.ts` | 132–147 | Public widget endpoints allowed requests lacking both `Origin` and `Referer` headers even when a chatbot had strict allowed domains configured. | High | Fixed | Enforced rejection (`403 Forbidden`) for headerless requests whenever one or more allowlisted domains exist for that chatbot. |
| Pending Invoice Plan Activation | `server/routes/billing.ts` | 469–500, 920–971 | Pending checkouts (`ManualInvoice` or unconfirmed Stripe intents) previously cancelled the tenant's existing active plan and created a new row without reconciling payment settlement status into active entitlements. | High | Fixed | Pending checkouts now create a `PastDue` subscription without disturbing the current `Active` plan; Super Admin settlement transitions `PastDue` to `Active` (or reverts refunded/failed records cleanly). |
| Sandbox Billing Production Gate | `server/services/paymentGatewayService.ts` | 30–33, 129–131 | `SandboxCard` test billing could settle paid plans when running in production without an explicit opt-in flag. | High | Fixed | Disabled paid `SandboxCard` charges in production unless `ENABLE_SANDBOX_BILLING=true` is explicitly configured on the server; updated `BillingController` route checks and client checkout UI accordingly. |
| Expired Subscription Entitlements | `server/routes/billing.ts` | 44–47, 301–348, 566–574 | Quota and billing queries checked `Status = 'Active'` without verifying `ExpiresOn`, allowing expired paid plans to retain elevated chatbot/message/crawler limits. | Medium | Fixed | Added `(ExpiresOn IS NULL OR ExpiresOn > now)` checks across billing, chatbot creation, website ingestion, widget monthly quotas, analytics, and admin reporting queries. |
| Token Validation Hardening | `server/utils/crypto.ts` | 73–99 | Access token verification checked HMAC signatures and issuer/audience claims but did not explicitly assert `header.alg === 'HS256'`, `header.typ === 'JWT'`, and positive integer `sub`. | Medium | Fixed | Explicitly validated decoded header algorithm/type and positive integer subject IDs before accepting any token. |
| Session Revocation on Account Changes | `server/routes/users.ts`, `server/routes/businesses.ts` | 96–103, 170–175, 107–115 | Active refresh tokens remained valid briefly after password rotation, user deactivation, or workspace suspension. | Medium | Fixed | Wrapped password changes, user deactivation, and business suspension/deactivation in transactions revoking all active `RefreshTokens` rows (`RevokedOn = now`). |
| Handover Email URI Validation | `server/widgetScript.ts` | 309–322 | Widget handover rendering created a `mailto:` link without re-validating email format on the client side before assigning `mail.href`. | Low | Fixed | Added strict email regex verification prior to constructing `mailto:` links inside the Shadow DOM widget. |
| HTTP Security Headers & Rate-Limiter Pruning | `server.ts`, `server/middleware/rateLimit.ts` | 28–35, 11–29 | Express exposed `x-powered-by` and lacked baseline defensive headers; rate-limiter buckets were only purged on individual key reuse. | Low | Fixed | Disabled `x-powered-by`, added `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy` (preserving iframe compatibility), and added periodic + threshold bucket pruning. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Secrets | `server/config.ts`, `server/services/geminiService.ts` | `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, and `JWT_ACCESS_SECRET` are loaded exclusively on the backend (`process.env`) and never bundled into browser code. |
| Database Queries & Integrity | `server/db.ts`, `server/routes/*.ts` | Parameterized SQLite prepared statements (`node:sqlite`), foreign-key cascade enforcement (`PRAGMA foreign_keys = ON`), WAL mode, and `busy_timeout = 5000`. |
| Multi-Tenant Data Isolation | `server/middleware/auth.ts`, `server/routes/*.ts` | Every tenant query derives `businessId` solely from verified JWT + active `BusinessUsers` membership, never from request body/query overrides. |
| Authentication & Token Storage | `src/context/AuthContext.jsx`, `server/routes/auth.ts` | Access and refresh tokens remain in React memory (no `localStorage`/`sessionStorage`), protected by `scrypt` per-user salts and refresh token reuse detection. |
| CSV Formula Export Safety | `server/routes/conversations.ts` | Prefixes leading `=`, `+`, `-`, `@`, tab, and CR characters with `'` to neutralize spreadsheet formula execution on exported transcripts. |

---

## PoC Verification

### IPv6 & Mapped-Address SSRF Bypass in Website Crawler

#### Summary
| Field | Value |
|---|---|
| Issue Type | Outbound Server Request Target Bypass |
| Impact | High |
| Affected File | `server/services/websiteCrawlerService.ts:44-160` |
| Test Scenario | Submitting `http://[::1]/admin`, `http://[0:0:0:0:0:0:0:1]/`, `http://[::ffff:127.0.0.1]/`, `http://[::ffff:7f00:1]/`, `http://[fe90::1]/`, and `http://[fc00::1]/` to `crawlWebsiteContent()` |

#### How It Was Fixed
`assertSafePublicUrl` now strips leading/trailing IPv6 brackets from `parsed.hostname` before checking loopback/local names and calling `net.isIP(hostname)`. `isPrivateOrReservedIp` delegates IPv6 addresses to `parseIpv6ToWords`, which expands all compressed (`::`) and dotted-quad notations into eight 16-bit words and explicitly rejects unspecified, loopback, IPv4-compatible, IPv4-mapped, NAT64, ULA (`fc00::/7`), link-local (`fe80::/10`), multicast (`ff00::/8`), and documentation (`2001:db8::/32`) blocks.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Test URL (e.g., `http://[::ffff:7f00:1]/`) enters `crawlWebsiteContent` and calls `assertSafePublicUrl` | Parsed as `URL` with HTTP protocol |
| 2 | `hostname` strips `[` and `]` (`::ffff:7f00:1`), matches `net.isIP(hostname) === 6`, and calls `isPrivateOrReservedIp` (`server/services/websiteCrawlerService.ts:150-165`) | IPv6 prefix `::ffff:0:0/96` converts lower 32 bits via `wordsToIpv4` to `127.0.0.1` |
| 3 | `isPrivateOrReservedIpv4('127.0.0.1')` returns `true` (`server/services/websiteCrawlerService.ts:33`) | **Blocked with HTTP 400 before any socket connection** |

#### Conclusion
**Fix Verified** - Bracketed, expanded, IPv4-mapped, and link-local IPv6 targets are blocked reliably before any outbound HTTP request is attempted.

---

### Headerless Widget Domain Allowlist Bypass

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Origin Enforcement on Allowlisted Widget Endpoints |
| Impact | High |
| Affected File | `server/services/domainAllowlistService.ts:132-147` |
| Test Scenario | Sending a request without `Origin` or `Referer` headers to `GET /api/v1/widget/:publicId/config` after adding `app.tenanta.test` to `AllowedDomains` |

#### How It Was Fixed
When `evaluateWidgetOrigin` sees that `!originInfo` (neither `Origin` nor `Referer` was supplied), it checks the `AllowedDomains` query result (`rows.length > 0`). If one or more allowed domain rules exist for the chatbot, headerless requests are denied with HTTP `403`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Client sends `GET /api/v1/widget/:publicId/config` with no `Origin` or `Referer` headers (`server/routes/widget.ts:118-123`) | Enters `evaluateWidgetOrigin` |
| 2 | `originInfo` resolves to `null`; `AllowedDomains` contains `app.tenanta.test` (`rows.length === 1`) | Matches `rows.length > 0` check at `server/services/domainAllowlistService.ts:134` |
| 3 | Returns `{ allowed: false, reason: 'Origin or Referer header is required...' }` | **Rejected with HTTP 403 Forbidden** |

#### Conclusion
**Fix Verified** - Domain-restricted widgets can no longer be queried or metered by direct requests lacking browser origin context.

---

### Pending Invoice Checkout & Entitlement Activation

#### Summary
| Field | Value |
|---|---|
| Issue Type | Unpaid Subscription Plan Elevation |
| Impact | High |
| Affected File | `server/routes/billing.ts:469-500, 920-971` |
| Test Scenario | Issuing `POST /api/v1/subscription/checkout` for `STARTER` using `ManualInvoice` (creates `Pending` payment), then attempting to exceed the Free chatbot quota (`MaxChatbots = 1`) before Super Admin settlement |

#### How It Was Fixed
Non-settled gateway results (`ManualInvoice` > $0 or unconfirmed Stripe intents) now insert a `PastDue` subscription record without modifying the tenant's active plan. When a Super Admin marks that payment `Succeeded` in `PATCH /api/v1/admin/payments/:id/status`, the transaction supersedes prior `Active`/`PastDue` rows and activates the `PastDue` subscription with a fresh expiration timestamp.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Tenant checks out `STARTER` with `provider: 'ManualInvoice'` (`server/routes/billing.ts:469-500`) | Inserts `Subscriptions` with `Status = 'PastDue'` and `Payments` with `Status = 'Pending'`; existing Free tier `Active` row stays intact |
| 2 | Tenant attempts `POST /api/v1/chatbots` for a second bot (`server/routes/chatbots.ts:366-390`) | Quota check sees `MaxChatbots = 1` from active Free plan -> **Rejected with HTTP 403** |
| 3 | Super Admin reconciles payment to `Succeeded` (`server/routes/billing.ts:920-937`) | Transaction promotes `PastDue` row to `Active` with 30-day `ExpiresOn`; second chatbot creation succeeds (`HTTP 201`) |

#### Conclusion
**Fix Verified** - Paid entitlements remain locked until invoice or payment settlement completes.

---

### Stale Refresh Tokens After Password Rotation, Suspension, or Deactivation

#### Summary
| Field | Value |
|---|---|
| Issue Type | Incomplete Session Invalidation on Account Security Events |
| Impact | Medium |
| Affected File | `server/routes/users.ts:96-103, 170-175` & `server/routes/businesses.ts:107-115` |
| Test Scenario | Calling `POST /api/v1/auth/refresh` with a previously issued refresh token immediately after user password rotation (`PUT /api/v1/users/me/password`), admin user deactivation (`PATCH /api/v1/users/:id/status`), or workspace suspension (`PATCH /api/v1/businesses/:id/status`) |

#### How It Was Fixed
Each state-changing route now executes inside an atomic database transaction that sets `RevokedOn = now` across all unrevoked `RefreshTokens` rows for the affected user or business members.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Valid refresh token is issued at login (`server/routes/auth.ts:51-57`) | Active token stored in `RefreshTokens` |
| 2 | User changes password / Admin suspends workspace / Admin deactivates user | Atomic transaction sets `RevokedOn` on all open `RefreshTokens` rows |
| 3 | Attacker replays prior token on `POST /api/v1/auth/refresh` (`server/routes/auth.ts:363-382`) | Token row has non-null `RevokedOn` -> **Rejected with HTTP 401 & audited** |

#### Conclusion
**Fix Verified** - Compromised or pre-revocation refresh tokens cannot mint new access tokens after password updates or administrative lockouts.
