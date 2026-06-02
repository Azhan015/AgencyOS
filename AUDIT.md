# AgencyOS Backend — Project Handover Audit

> **Generated:** May 2026  
> **Stack:** TypeScript 5.3 · Express 4 · MongoDB/Mongoose 8 · Redis · Bull · Socket.io 4 · Stripe · S3/R2  
> **Architecture:** Multi-tenant enterprise SaaS — fully migrated from single-tenant  
> **TypeScript:** 0 errors · Unit tests: 55/55 passing

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Boot Sequence](#2-boot-sequence)
3. [Environment Variables](#3-environment-variables)
4. [Config Layer](#4-config-layer)
5. [Middleware Pipeline](#5-middleware-pipeline)
6. [Data Models](#6-data-models)
7. [Auth Module](#7-auth-module)
8. [Platform Admin System](#8-platform-admin-system)
9. [Organization Module](#9-organization-module)
10. [Business Modules](#10-business-modules)
11. [Library Layer](#11-library-layer)
12. [Workers & Background Jobs](#12-workers--background-jobs)
13. [Socket.io Layer](#13-socketio-layer)
14. [Migration Scripts](#14-migration-scripts)
15. [API Route Reference](#15-api-route-reference)
16. [Redis Key Namespace Reference](#16-redis-key-namespace-reference)
17. [Storage Key Conventions](#17-storage-key-conventions)
18. [Role & Permission Matrix](#18-role--permission-matrix)
19. [Multi-Tenancy Architecture](#19-multi-tenancy-architecture)
20. [Security Hardening Summary](#20-security-hardening-summary)
21. [Deployment Checklist](#21-deployment-checklist)
22. [Known Gaps & Future Work](#22-known-gaps--future-work)

---

## 1. Project Structure

```
backend/
├── src/
│   ├── app.ts                        # Express app factory — all middleware + routes
│   ├── server.ts                     # HTTP server bootstrap — DB, Redis, Socket.io, crons
│   │
│   ├── config/
│   │   ├── env.ts                    # Zod-validated env vars — process exits on invalid config
│   │   ├── db.ts                     # MongoDB connect/disconnect with retry (5 attempts)
│   │   ├── redis.ts                  # Redis client pool + cache helpers (graceful degradation)
│   │   ├── bullRedis.ts              # ioredis options for Bull queues (TLS-aware)
│   │   └── storage.ts                # S3/R2 client — upload, download, org-scoped keys
│   │
│   ├── lib/
│   │   ├── crypto.ts                 # AES-256-GCM encrypt/decrypt, SHA-256, tokens, slugs
│   │   ├── email.ts                  # Nodemailer transport
│   │   ├── emailTemplates/           # 22 HTML email templates + dispatcher
│   │   ├── errors.ts                 # AppError class hierarchy (9 error types)
│   │   ├── frontendUrl.ts            # Request-aware frontend URL resolver
│   │   ├── jwt.ts                    # Org + platform JWT sign/verify
│   │   ├── platformJwt.ts            # Re-exports platform JWT functions
│   │   ├── logger.ts                 # Pino structured logger
│   │   ├── passport.ts               # Google OAuth 2.0 strategy
│   │   ├── pdf.ts                    # Invoice + Contract PDF generation
│   │   ├── stripe.ts                 # Stripe client + subscription helpers
│   │   └── cacheInvalidation.ts      # CacheGroups, invalidateOrgSessions, purgeOrgCache
│   │
│   ├── middleware/
│   │   ├── authenticate.ts           # JWT auth for org users + platform users
│   │   ├── authorize.ts              # RBAC permission + role guards + requireFeature
│   │   ├── tenantScope.ts            # Org validation, status enforcement, req.tenantFilter
│   │   ├── auditLog.ts               # Factory: creates AuditLog entry for any route
│   │   ├── rateLimiter.ts            # 5 rate limiters + plan-based orgApiLimiter
│   │   ├── errorHandler.ts           # Global error handler + 404 handler
│   │   ├── validate.ts               # Zod schema validation (body/query/params)
│   │   └── requestId.ts              # X-Request-ID header injection
│   │
│   ├── models/                       # 17 Mongoose models (all org-scoped)
│   │   ├── Organization.ts           # Tenant model — lifecycle, billing, limits, features
│   │   ├── PlatformUser.ts           # Platform admin model (above all tenants)
│   │   ├── User.ts                   # Org user — argon2id passwords, devices, orgRole
│   │   ├── Client.ts                 # Client accounts with storage quotas
│   │   ├── Project.ts                # Projects with milestones + health score
│   │   ├── Task.ts                   # Tasks (Kanban) with dependencies
│   │   ├── Invoice.ts                # Invoices with Stripe payment tracking
│   │   ├── Contract.ts               # Contracts with digital signatures
│   │   ├── ContractTemplate.ts       # Reusable contract templates
│   │   ├── File.ts                   # Files with versioning + virus scan status
│   │   ├── Message.ts                # Messages with read receipts + soft delete
│   │   ├── Channel.ts                # Messaging channels (project/direct/announcement)
│   │   ├── Notification.ts           # In-app notifications (90-day TTL)
│   │   ├── AutomationRule.ts         # Event-driven automation rules
│   │   ├── AuditLog.ts               # Immutable audit trail (org + platform actions)
│   │   ├── Approval.ts               # Deliverable approval workflow
│   │   └── Brief.ts                  # Project brief Q&A
│   │
│   ├── modules/
│   │   ├── auth/                     # JWT, magic link, OAuth, password reset
│   │   ├── admin/                    # Team management, audit logs, DB health
│   │   ├── analytics/                # Org-scoped agency/project/client dashboards
│   │   ├── approvals/                # Deliverable review workflow
│   │   ├── automations/              # Rule engine (SEND_NOTIFICATION, CREATE_TASK, etc.)
│   │   ├── clients/                  # Client CRUD + invite flow
│   │   ├── contracts/                # Contract lifecycle + signing (feature-flagged)
│   │   ├── files/                    # File upload/management + virus scanning
│   │   ├── invoices/                 # Invoice lifecycle + Stripe checkout
│   │   ├── messages/                 # Real-time messaging
│   │   ├── notifications/            # Notification management
│   │   ├── organizations/            # Org registration + self-service billing
│   │   ├── projects/                 # Project management + health scores
│   │   ├── tasks/                    # Task management (Kanban)
│   │   └── platform/                 # Platform admin (7 sub-modules)
│   │       ├── auth/                 # Platform login/refresh/logout
│   │       ├── organizations/        # Org approve/reject/suspend/reactivate
│   │       ├── analytics/            # Cross-org metrics, MRR, funnel
│   │       ├── users/                # Platform user management
│   │       ├── impersonation/        # Org impersonation (1h TTL)
│   │       ├── billing/              # Stripe subscription lifecycle + webhooks
│   │       └── flags/                # Per-org feature flag management
│   │
│   ├── sockets/
│   │   └── socketServer.ts           # Socket.io — org-namespaced rooms, Redis adapter
│   │
│   ├── types/
│   │   └── express.d.ts              # Express.User + Express.PlatformUser type augmentation
│   │
│   ├── workers/
│   │   ├── emailWorker.ts            # Bull queue — template-based async email delivery
│   │   ├── invoiceWorker.ts          # Bull queue — invoice PDF generation
│   │   ├── scanWorker.ts             # Bull queue — ClamAV virus scanning
│   │   ├── scheduledJobs.ts          # node-cron — overdue invoices, health scores, analytics
│   │   └── trialLifecycleJobs.ts     # node-cron — trial expiry, reminders, subscription grace
│   │
│   └── migrations/
│       ├── 001_add_organizationId_indexes.ts   # Creates all compound indexes (idempotent)
│       ├── 002_backfill_organizationId.ts       # Backfills legacy single-tenant data
│       └── 003_migrate_storage_keys.ts          # Migrates S3 keys to org-scoped format
│
├── .env                              # Local environment variables (never commit)
├── .env.example                      # Template for all required env vars
├── package.json                      # Scripts: dev, build, test, migrate:*
├── jest.config.ts                    # Jest config — mongodb-memory-server, ts-jest
└── Dockerfile                        # Production Docker image
```

---

## 2. Boot Sequence

```
npm run dev  →  ts-node-dev src/server.ts
                │
                ├─ 1. connectDB()           MongoDB (pool: 5–20, retry: 5×5s)
                ├─ 2. connectRedis()        Redis (3 clients: main/pub/sub, 5s timeout, non-fatal)
                ├─ 3. http.createServer(app)
                ├─ 4. initSocketServer()    Socket.io + Redis adapter (if Redis available)
                ├─ 5. startScheduledJobs()  5 cron jobs (invoices, health, analytics, storage)
                ├─ 6. startTrialLifecycleJobs()  5 cron jobs (trial expiry, reminders, grace)
                └─ 7. httpServer.listen(PORT)

Graceful shutdown (SIGTERM / SIGINT):
  httpServer.close() → disconnectDB() → disconnectRedis() → process.exit(0)
  Force exit after 30s timeout
```

### app.ts Middleware Stack (execution order)

| # | Middleware | Purpose |
|---|-----------|---------|
| 1 | `trust proxy = 1` | Correct IP behind load balancer |
| 2 | `helmet()` | Security headers + CSP |
| 3 | `cors()` | Whitelist: FRONTEND_URL, localhost:3000, localhost:5173 |
| 4 | `express.raw()` | Stripe webhooks — raw body BEFORE json parser |
| 5 | `express.json({ limit: 10mb })` | JSON body parsing |
| 6 | `cookieParser()` | Cookie parsing (refresh tokens, CSRF) |
| 7 | `compression()` | Gzip response compression |
| 8 | `mongoSanitize()` | NoSQL injection prevention |
| 9 | `hpp()` | HTTP Parameter Pollution prevention |
| 10 | CSRF middleware | Double-submit cookie pattern (skipped for webhooks/Bearer-only) |
| 11 | `passport.initialize()` | Google OAuth |
| 12 | `requestId` | X-Request-ID header |
| 13 | `generalLimiter` | 200 req/min per IP (configurable) |
| 14 | `GET /health` | Health check — no auth |
| 15 | `POST /api/platform/bootstrap` | One-time platform owner creation |
| 16 | Route modules | All API routes |
| 17 | `notFoundHandler` | 404 for unknown routes |
| 18 | `errorHandler` | Global error handler — must be last |

---

## 3. Environment Variables

### Required in all environments

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | ≥32 chars — org user access token signing |
| `JWT_REFRESH_SECRET` | ≥32 chars — org user refresh token signing |

### Required in production (have dev defaults)

| Variable | Dev Default | Description |
|----------|-------------|-------------|
| `PLATFORM_JWT_ACCESS_SECRET` | `platform-access-secret-change-in-production-min32` | Platform admin access token — CHANGE THIS |
| `PLATFORM_JWT_REFRESH_SECRET` | `platform-refresh-secret-change-in-production-min32` | Platform admin refresh token — CHANGE THIS |
| `ENCRYPTION_KEY` | Dev fallback (throws in prod) | ≥32 chars — AES-256-GCM for contract signatures |

### Optional (features degrade gracefully without them)

| Variable | Feature |
|----------|---------|
| `REDIS_URL` | Cache, sessions, queues, Socket.io scaling |
| `STRIPE_SECRET_KEY` | Invoice payments |
| `STRIPE_WEBHOOK_SECRET` | Invoice webhook verification |
| `STRIPE_PRICE_STARTER_MONTHLY` | Subscription checkout |
| `STRIPE_PRICE_STARTER_ANNUAL` | Subscription checkout |
| `STRIPE_PRICE_GROWTH_MONTHLY` | Subscription checkout |
| `STRIPE_PRICE_GROWTH_ANNUAL` | Subscription checkout |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` | Subscription checkout |
| `STRIPE_PRICE_ENTERPRISE_ANNUAL` | Subscription checkout |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth login |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 file storage |
| `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Cloudflare R2 (overrides S3) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Email delivery |
| `VIRUS_SCAN_ENABLED=true` | ClamAV virus scanning |
| `CLAMAV_HOST` / `CLAMAV_PORT` | ClamAV daemon address |

---

## 4. Config Layer

### `config/env.ts`
Validates all environment variables at startup using Zod. **Process exits immediately** if any required variable is missing or invalid. Exports a single `env` object used throughout the codebase.

### `config/db.ts`
- `connectDB()` — connects with pool (min 5, max 20), retries 5× with 5s delay
- `disconnectDB()` — clean disconnect for graceful shutdown

### `config/redis.ts`
Creates **3 Redis clients**: main (read/write), subscriber, publisher (for Socket.io adapter).

Key exports:
| Export | Description |
|--------|-------------|
| `connectRedis()` | Connects all 3 clients with 5s timeout — non-fatal if fails |
| `isRedisAvailable()` | Boolean flag — check before any Redis operation |
| `getRedisClient()` | Returns main client (throws if not initialized) |
| `getRedisSubscriber()` | Returns subscriber client |
| `getRedisPublisher()` | Returns publisher client |
| `cacheGet<T>(key)` | Get + JSON parse — returns null if Redis unavailable |
| `cacheSet(key, value, ttl?)` | Set + JSON serialize — no-op if Redis unavailable |
| `cacheDel(key)` | Delete key — no-op if Redis unavailable |
| `cacheDelPattern(pattern)` | Delete by glob pattern |
| `orgCacheGet<T>(orgId, key)` | Namespaced: `org:{orgId}:{key}` |
| `orgCacheSet(orgId, key, value, ttl?)` | Namespaced set |
| `orgCacheDel(orgId, ...keys)` | Namespaced delete |
| `trackOrgSession(orgId, sessionId)` | Adds sessionId to `org:sessions:{orgId}` SET (7d TTL) |

### `config/bullRedis.ts`
- `getBullRedisOptions()` — parses `REDIS_URL` into ioredis options for Bull queues. Handles TLS (`rediss://`) by setting `tls: {}`.

### `config/storage.ts`
Supports both **AWS S3** and **Cloudflare R2** (R2 takes priority if `R2_ENDPOINT` is set).

Key exports:
| Export | Description |
|--------|-------------|
| `uploadFile(key, body, contentType, metadata?)` | Upload with AES256 server-side encryption |
| `getSignedDownloadUrl(key, expiresIn?)` | 5-min signed URL (default) |
| `getSignedUploadUrl(key, contentType, expiresIn?)` | Presigned upload URL |
| `deleteFile(key)` | Delete from storage |
| `fileExists(key)` | HEAD check |
| `generateStorageKey(prefix, filename)` | Legacy key format: `{prefix}/{timestamp}_{filename}` |
| `generateOrgStorageKey(orgId, category, filename, subPath?)` | Org-scoped: `organizations/{orgId}/{category}/...` |
| `generateProjectFileKey(orgId, projectId, folder, filename)` | `organizations/{orgId}/projects/{projectId}/{folder}/...` |
| `validateStorageKeyOwnership(key, orgId)` | Returns false if key doesn't belong to org |
| `getOrgSignedDownloadUrl(key, orgId, expiresIn?)` | Validates ownership before signing — throws on cross-tenant key |
| `initiateMultipartUpload` / `uploadPart` / `completeMultipartUpload` / `abortMultipartUpload` | Large file support |

---

## 5. Middleware Pipeline

### `middleware/authenticate.ts`

Two exported middleware functions:

| Export | Description |
|--------|-------------|
| `authenticate` | Org-user JWT auth. Reads `Authorization: Bearer <token>`, verifies with `JWT_ACCESS_SECRET`, checks `revoked:session:{sessionId}` in Redis, loads user from cache (`user:{id}`, 5-min TTL) or MongoDB. Sets `req.user` with `isPlatformUser: false`. Also tracks session in `org:sessions:{orgId}` SET (fire-and-forget). |
| `authenticatePlatform` | Platform-user JWT auth. Uses `PLATFORM_JWT_ACCESS_SECRET`. Checks `platform:revoked:session:{sessionId}`. Loads from `platform:user:{id}` cache. Sets `req.user` with `isPlatformUser: true` and optional `impersonating` context. |
| `optionalAuthenticate` | Non-blocking variant of `authenticate` — passes through if no token present. |
| `AuthRequest` | Type alias for `Request` — used throughout route files. |

**`req.user` shape (org user):**
```typescript
{
  id, email, role, orgRole, organizationId,
  clientId?, sessionId, name, isPlatformUser: false
}
```

**`req.user` shape (platform user):**
```typescript
{
  id, email, platformRole, sessionId, name,
  isPlatformUser: true,
  impersonating?: { organizationId, originalPlatformUserId, grantedAt }
}
```

---

### `middleware/authorize.ts`

| Export | Description |
|--------|-------------|
| `authorize(...permissions)` | Checks user has ALL listed permissions. Works for both org and platform users. `PLATFORM_OWNER` with `platform:*` bypasses all checks. Falls back to legacy role permissions during migration. |
| `authorizeRoles(...roles)` | Checks `orgRole` OR legacy `role` is in the allowed list. |
| `requireFeature(featureKey)` | Checks `req.organization.features[key]` is `true`. Must run after `tenantScope`. Used on contracts and automations routes. |
| `hasPermission(role, permission)` | Utility for service-layer permission checks. |
| `ORG_ROLE_PERMISSIONS` | Full permission matrix for 5 org roles. |
| `PLATFORM_ROLE_PERMISSIONS` | Full permission matrix for 3 platform roles. |

---

### `middleware/tenantScope.ts`

Must run **after** `authenticate`. Validates the org and attaches it to the request.

| Export | Description |
|--------|-------------|
| `tenantScope` | Loads org from `org:{orgId}:meta` cache (5-min TTL) or MongoDB. Enforces status: blocks SUSPENDED, EXPIRED_TRIAL, ARCHIVED, REJECTED, PENDING_APPROVAL. Sets `req.organization` and `req.tenantFilter = { organizationId }`. Platform users bypass unless impersonating. |
| `assertSameOrg(resourceOrgId, requestingOrgId)` | Throws `AuthorizationError` if IDs don't match — used in service functions to prevent cross-tenant access. |
| `invalidateOrgCache(orgId)` | Deletes `org:{orgId}:meta` from Redis — call after any org data change. |

---

### `middleware/auditLog.ts`

| Export | Description |
|--------|-------------|
| `auditLog(action, resource)` | Factory middleware. Creates an `AuditLog` document with userId, action, resource, resourceId, organizationId, IP, user-agent. Errors are caught and logged — never propagate. Correctly resolves `organizationId` for both org users and impersonating platform users. |

---

### `middleware/rateLimiter.ts`

| Export | Window | Max | Used On |
|--------|--------|-----|---------|
| `generalLimiter` | 60s (configurable) | 200 (configurable) | All `/api/` routes |
| `authLimiter` | 60s | 10 | Login, register, magic-link, OAuth |
| `uploadLimiter` | 60s | 20 | File upload |
| `strictLimiter` | 60s | 5 | Magic-link send, forgot-password, Stripe webhooks, ownership transfer |
| `orgRegistrationLimiter` | 1h | 3 | `POST /organizations/register` |
| `orgApiLimiter` | 60s | Plan-based | All org-scoped routes (after authenticate+tenantScope) |

**Plan-based API limits:**
| Plan | Requests/min |
|------|-------------|
| TRIAL | 60 |
| STARTER | 300 |
| GROWTH | 1000 |
| ENTERPRISE | 5000 |

All limiters are **disabled in test environment** (`NODE_ENV === 'test'`). `orgApiLimiter` degrades gracefully when Redis is unavailable.

---

### `middleware/errorHandler.ts`

Handles in order:
1. `ZodError` → 400 with `fieldErrors`
2. `mongoose.Error.ValidationError` → 400 with field details
3. MongoDB duplicate key (code 11000) → 409 Conflict
4. `mongoose.Error.CastError` (invalid ObjectId) → 400
5. `AppError` (operational) → appropriate status code
6. Unknown errors → 500 (stack hidden in production)

| Export | Description |
|--------|-------------|
| `errorHandler` | Global error handler — must be last middleware |
| `notFoundHandler` | Returns 404 for unmatched routes |

---

### `middleware/validate.ts`

| Export | Description |
|--------|-------------|
| `validateBody(schema)` | Validates `req.body` against Zod schema, replaces with parsed value |
| `validateQuery(schema)` | Validates `req.query` |
| `validateParams(schema)` | Validates `req.params` |

---

### `middleware/requestId.ts`

| Export | Description |
|--------|-------------|
| `requestId` | Reads `X-Request-ID` header or generates UUID. Sets on both `req.headers` and response header. |

---

## 6. Data Models

All 15 tenant models have `organizationId: { type: ObjectId, ref: 'Organization', required: true }` with compound indexes starting with `organizationId` as the leftmost field.

### `Organization` (tenant root)

The central tenant model. Every other model references it.

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Display name |
| `slug` | String (unique) | URL-safe identifier e.g. `acme-agency` |
| `status` | Enum | `PENDING_APPROVAL → ACTIVE → SUSPENDED / EXPIRED_TRIAL / ARCHIVED` |
| `plan` | Enum | `TRIAL / STARTER / GROWTH / ENTERPRISE` |
| `limits` | Object | `seats, storageBytes, projects, clients, automations` (-1 = unlimited) |
| `usage` | Object | `seats, storageUsedBytes, projects, clients` — tracked in real-time |
| `features` | Object | Per-org feature flags: `contractModule, invoiceModule, automationsModule, analyticsModule, apiAccess, whiteLabel, customDomain, ssoEnabled` |
| `trialStartsAt / trialEndsAt` | Date | Trial window — used by cron jobs |
| `expiresAt` | Date | Subscription expiry — used by cron jobs |
| `stripeCustomerId / stripeSubscriptionId / stripePriceId` | String | Stripe billing |
| `mrr` | Number | Monthly Recurring Revenue in cents |
| `ownerEmail` | String | Denormalized from first user for fast lookup |
| `onboarding` | Object | `completedSteps, currentStep, completedAt` |
| `metadata` | Mixed | Arbitrary key-value store |

Static method: `Organization.getDefaultLimits(plan)` — returns plan-appropriate limits.

---

### `PlatformUser` (above all tenants)

Separate from org `User` model. Used exclusively for `/api/platform/*` routes.

| Field | Type | Description |
|-------|------|-------------|
| `email` | String (unique) | Login email |
| `passwordHash` | String (select: false) | argon2id hash |
| `platformRole` | Enum | `PLATFORM_OWNER / PLATFORM_ADMIN / PLATFORM_SUPPORT` |
| `isActive` | Boolean | Deactivated users cannot log in |
| `createdBy` | ObjectId | Who created this platform user |

Method: `toSafeObject()` — strips `passwordHash` and `__v`.

---

### `User` (org-scoped)

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | ObjectId (required) | Tenant reference |
| `email` | String | Unique per org (compound index) |
| `passwordHash` | String (select: false) | argon2id |
| `orgRole` | Enum | `ORGANIZATION_OWNER / ORGANIZATION_ADMIN / PROJECT_MANAGER / CONTRIBUTOR / CLIENT` |
| `role` | Enum | Legacy field — kept for backward compat during migration |
| `clientId` | ObjectId? | Set for CLIENT role users |
| `isActive` | Boolean | Inactive users cannot log in |
| `devices[]` | Array | Max 5 devices — oldest evicted on overflow |
| `googleId` | String? | Google OAuth ID |
| `notificationPrefs` | Object | Email/in-app/push preferences |

Compound indexes: `{organizationId, email}` unique, `{organizationId, orgRole}`, `{organizationId, isActive}`.

---

### `Client`

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | ObjectId (required) | Tenant |
| `slug` | String | Unique per org |
| `companyName, contactName, email` | String | Contact info |
| `tier` | Enum | `STARTER / GROWTH / ENTERPRISE` |
| `status` | Enum | `INVITED / ONBOARDING / ACTIVE / SUSPENDED` |
| `storageUsedBytes / storageLimitBytes` | Number | Per-client storage quota |
| `stripeCustomerId` | String? | For invoice payments |

---

### `Project`

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | ObjectId (required) | Tenant |
| `slug` | String | Unique per org |
| `clientId` | ObjectId | Client reference |
| `pm` | ObjectId | Project manager (User) |
| `contributors[]` | ObjectId[] | Team members |
| `status` | Enum | `SCOPING / ACTIVE / REVIEW / COMPLETED / ARCHIVED` |
| `milestones[]` | Array | `{ name, dueDate, status, invoiceAmount, triggerInvoice, order }` |
| `healthScore` | Number | 0–100, computed by cron every 6h |
| `brief` | ObjectId? | Brief reference |

---

### `Task`

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | ObjectId (required) | Tenant |
| `projectId` | ObjectId | Project reference |
| `status` | Enum | `BACKLOG / IN_PROGRESS / REVIEW / DONE` |
| `priority` | Enum | `LOW / MEDIUM / HIGH / URGENT` |
| `assignees[]` | ObjectId[] | Assigned users |
| `dependencies[]` | ObjectId[] | Blocking tasks |
| `completedAt / completedBy` | Date/ObjectId | Set when status → DONE |

---

### `Invoice`

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | ObjectId (required) | Tenant |
| `invoiceNumber` | String | Unique per org: `INV-YYYY-NNNN` |
| `status` | Enum | `DRAFT / SENT / VIEWED / PARTIAL / PAID / OVERDUE / VOID` |
| `lineItems[]` | Array | `{ description, quantity, unitPrice, amount }` |
| `subtotal, tax, taxRate, discount, total` | Number | Calculated fields |
| `paymentGateway` | Enum? | `STRIPE / RAZORPAY / MANUAL` |
| `checkoutSessionId / paymentIntentId` | String? | Stripe references |
| `pdfKey` | String? | S3/R2 storage key for generated PDF |
| `remindersSent[]` | Date[] | Reminder history |

---

### `Contract`

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | ObjectId (required) | Tenant |
| `type` | Enum | `NDA / SOW / RETAINER / CHANGE_ORDER` |
| `status` | Enum | `DRAFT / SENT / VIEWED / SIGNED / EXECUTED / EXPIRED` |
| `content` | String | Contract body with `{{variable}}` placeholders |
| `clientSignature / agencySignature` | Object | `{ svg, signedAt, ipAddress, userAgent, hash, signerName }` |
| `pdfKey` | String? | Generated PDF storage key |

---

### `File`

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | ObjectId (required) | Tenant |
| `storageKey` | String | S3/R2 key — new format: `organizations/{orgId}/projects/...` |
| `version` | Number | Incremented on re-upload |
| `parentFileId` | ObjectId? | Previous version reference |
| `scanStatus` | Enum | `PENDING / CLEAN / INFECTED / FAILED` |
| `annotations[]` | Array | `{ x, y, pageNum, comment, authorId, resolvedAt }` |
| `isClientVisible` | Boolean | Controls client portal visibility |

---

### `Notification`

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | ObjectId (required) | Tenant |
| `userId` | ObjectId | Recipient |
| `type` | Enum | 12 notification types |
| `isRead` | Boolean | Read status |

**TTL index:** auto-deleted after 90 days (`expireAfterSeconds: 7776000`).

---

### `AutomationRule`

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | ObjectId (required) | Tenant |
| `trigger` | Object | `{ event: TriggerEvent, conditions[] }` |
| `actions[]` | Array | `{ type: ActionType, params }` |
| `runCount / errorCount` | Number | Execution statistics |

**Supported action types:** `SEND_NOTIFICATION`, `SEND_EMAIL`, `CALL_WEBHOOK`, `CREATE_TASK`, `CHANGE_STATUS`, `SEND_INVOICE`

---

### `AuditLog`

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | ObjectId (sparse) | null = platform-level action |
| `userId` | ObjectId | Actor |
| `action` | String | e.g. `ORG_APPROVED`, `TEAM_MEMBER_INVITED` |
| `isPlatformAction` | Boolean | True for platform admin actions |
| `before / after` | Mixed | State snapshots (optional) |

Immutable — no `updatedAt` timestamp.

---

### `Message`, `Channel`, `Approval`, `Brief`, `ContractTemplate`

All have `organizationId: required` with appropriate compound indexes. See source files for full field definitions.

---

## 7. Auth Module

**Files:** `modules/auth/auth.routes.ts`, `auth.controller.ts`, `auth.service.ts`

### Routes

| Method | Path | Rate Limit | Auth | Description |
|--------|------|-----------|------|-------------|
| POST | `/register` | authLimiter | — | Register new user + auto-create org |
| POST | `/login` | authLimiter | — | Email + password login |
| POST | `/refresh` | — | — | Rotate refresh token (token family rotation) |
| POST | `/logout` | — | ✅ | Revoke session |
| POST | `/magic-link` | strictLimiter | — | Send magic link email |
| POST | `/magic-link/verify` | authLimiter | — | Verify magic link token |
| POST | `/forgot-password` | strictLimiter | — | Send password reset email |
| POST | `/reset-password` | authLimiter | — | Reset password with token |
| GET | `/me` | — | ✅ | Get current user |
| PATCH | `/me` | — | ✅ | Update name/avatar/prefs |
| PATCH | `/me/password` | — | ✅ | Change password |
| GET | `/devices` | — | ✅ | List trusted devices |
| DELETE | `/devices/:deviceId` | — | ✅ | Revoke device |
| GET | `/google` | authLimiter | — | Start Google OAuth |
| GET | `/google/callback` | — | — | Google OAuth callback |
| POST | `/dev-set-password` | — | — | Dev-only password set (403 in production) |

### Key security properties

- Passwords hashed with **argon2id** (memoryCost: 64MB, timeCost: 3, parallelism: 4)
- Refresh tokens use **token rotation** — each use issues a new token
- **Token family revocation** — reuse detection revokes all sessions in the family
- Magic link tokens are **single-use** (deleted from Redis on verify)
- Email enumeration prevented on magic-link and forgot-password endpoints
- Max **5 devices** per user — oldest evicted automatically
- JWT access tokens expire in **15 minutes**, refresh tokens in **7 days**

---

## 8. Platform Admin System

**Base path:** `/api/platform/`  
**Auth:** All routes (except `/bootstrap` and `/billing/webhook`) require `authenticatePlatform` — a **separate JWT** signed with `PLATFORM_JWT_ACCESS_SECRET`.

### Bootstrap (one-time setup)

```
POST /api/platform/bootstrap
Body: { email, name, password }
```
Creates the first `PLATFORM_OWNER`. Returns 403 if one already exists. No auth required.

### Sub-modules

#### `platform/auth` — `/api/platform/auth/`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Platform user login — returns platform JWT pair |
| POST | `/refresh` | Rotate platform refresh token |
| POST | `/logout` | Revoke platform session |

Uses separate Redis key namespace: `platform:refresh:`, `platform:revoked:session:`, `platform:revoked:family:`.

---

#### `platform/organizations` — `/api/platform/organizations/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | `orgs:read` | List all orgs (paginated, filterable by status/plan/search) |
| GET | `/pending` | `orgs:read` | List PENDING_APPROVAL orgs |
| GET | `/:id` | `orgs:read` | Get org detail |
| GET | `/:id/users` | `orgs:read` | List org users |
| GET | `/:id/audit-logs` | `orgs:read` | Org audit trail |
| POST | `/:id/approve` | `orgs:write` | Approve org — starts 14-day trial |
| POST | `/:id/reject` | `orgs:write` | Reject org with reason |
| POST | `/:id/suspend` | `orgs:write` | Suspend org |
| POST | `/:id/reactivate` | `orgs:write` | Reactivate suspended org |
| PATCH | `/:id/plan` | `orgs:write` | Change plan + update limits |
| PATCH | `/:id/features` | `feature-flags:write` | Update feature flags |
| POST | `/:id/extend-trial` | `orgs:write` | Extend trial by N days |

All write operations: invalidate org cache + create `AuditLog` with `isPlatformAction: true`.

---

#### `platform/analytics` — `/api/platform/analytics/`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/overview` | Total orgs, users, MRR, plan/status distribution, growth trend |
| GET | `/onboarding-funnel` | Registered → Approved → Activated → Paid conversion rates |
| GET | `/mrr` | 12-month MRR trend + ARR + MoM growth |
| GET | `/storage` | Top orgs by storage usage + platform totals |
| GET | `/organizations` | Org activity ranking (sortable by seats/mrr/storage/projects) |
| GET | `/api-usage` | Real-time API request volume by org (from Redis rate keys) |

All responses cached in Redis with TTLs (5–60 min). Cache refreshed every 15 min by cron.

---

#### `platform/users` — `/api/platform/users/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | `platform-users:read` | List all platform users |
| POST | `/` | `platform-users:write` | Create PLATFORM_ADMIN or PLATFORM_SUPPORT user |
| PATCH | `/:id/role` | `platform-users:write` | Change platform role |
| PATCH | `/:id/deactivate` | `platform-users:write` | Deactivate platform user |

Only `PLATFORM_OWNER` has `platform-users:write` permission.

---

#### `platform/impersonation` — `/api/platform/impersonation/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/start` | `impersonate` | Start impersonating an org — returns scoped access token (1h TTL) |
| POST | `/stop` | `impersonate` | Revoke impersonation session |
| GET | `/active` | `impersonate` | Check if current session is impersonating |

Impersonation token carries `impersonating: { organizationId, originalPlatformUserId, grantedAt }`. Session stored in Redis at `platform:impersonation:{sessionId}`. Creates audit log on start and stop.

---

#### `platform/billing` — `/api/platform/billing/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/webhook` | None (Stripe signature) | Stripe subscription webhook handler |
| GET | `/plans` | `billing:read` | Available plans + price IDs |
| POST | `/orgs/:orgId/change-plan` | `billing:write` | Change org plan + update Stripe subscription |
| POST | `/orgs/:orgId/cancel` | `billing:write` | Cancel org subscription |

**Webhook events handled:**
- `checkout.session.completed` — activates subscription, sets plan/limits/MRR
- `customer.subscription.updated` — syncs plan changes and renewals
- `customer.subscription.deleted` — downgrades to TRIAL, invalidates sessions
- `invoice.payment_succeeded` — renews `expiresAt`
- `invoice.payment_failed` — notifies owner, lets Stripe retry

---

#### `platform/flags` — `/api/platform/flags/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/defaults` | `feature-flags:read` | Global feature flag defaults |
| GET | `/orgs/:orgId` | `feature-flags:read` | Get org's current feature flags |
| PATCH | `/orgs/:orgId` | `feature-flags:write` | Update specific flags for an org |
| POST | `/orgs/:orgId/reset` | `feature-flags:write` | Reset flags to plan defaults |

---

## 9. Organization Module

**Base path:** `/api/v1/organizations/`

### Public routes (no auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Register new org + owner account. Creates org in `PENDING_APPROVAL` status. Sends confirmation email to owner + notification to platform admins. Includes honeypot field and IP rate limiting (3/hour). |
| GET | `/verify-slug?slug=` | Check if a slug is available. Returns suggestion if taken. |
| GET | `/status/:slug` | Check registration status (for pending/rejected pages). |

### Authenticated routes (require authenticate + tenantScope)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | `settings:read` | Get own org detail |
| PATCH | `/` | `settings:write` | Update org profile (name, logo, address, etc.) |
| GET | `/usage` | — | Current usage vs plan limits with percentages |
| GET | `/billing` | `billing:read` | Billing info — plan, subscription, MRR, trial dates |
| POST | `/invite-user` | `team:write` | Invite team member — checks seat limit, sends temp password |
| POST | `/transfer-ownership` | OWNER only | Atomic ownership transfer — requires password confirmation |
| DELETE | `/` | `org:delete` | Request deletion — 30-day grace period, safeguards (no active subscription, no unpaid invoices) |
| POST | `/billing/checkout` | `billing:write` | Create Stripe Checkout session for subscription |
| POST | `/billing/portal` | `billing:read` | Create Stripe Billing Portal session |
| POST | `/billing/cancel` | `billing:write` | Cancel subscription at period end |

---

## 10. Business Modules

All business modules follow the same pattern:
- Routes file mounts `authenticate` + `tenantScope` (and `requireFeature` where applicable)
- Service file accepts `organizationId` as first filter on every DB query
- `orgApiLimiter` applied at `app.ts` level for all org-scoped routes

### Admin — `/api/v1/admin/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/team` | `team:read` | List org users (paginated) |
| POST | `/team/invite` | `team:write` | Invite team member with role |
| PATCH | `/team/:id/role` | `team:write` | Change user role |
| PATCH | `/team/:id/deactivate` | `admin:write` | Deactivate user |
| GET | `/audit-logs` | `admin:read` | Org audit trail (paginated) |
| GET | `/db-health` | `admin:read` | MongoDB connection status |

### Analytics — `/api/v1/analytics/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/agency` | `analytics:read` | Agency-wide stats (revenue, projects, tasks) |
| GET | `/projects/:id` | `analytics:read` | Per-project analytics |
| GET | `/clients/:id` | `analytics:read` | Per-client analytics |

All queries scoped to `organizationId`.

### Approvals — `/api/v1/approvals/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | `approvals:read` | List approvals (filterable by project/status) |
| POST | `/` | `approvals:write` | Submit deliverable for approval |
| GET | `/:id` | `approvals:read` | Get approval detail |
| POST | `/:id/approve` | `approvals:write` | Approve deliverable |
| POST | `/:id/reject` | `approvals:write` | Reject with reason |
| POST | `/:id/request-revision` | `approvals:write` | Request revision |

### Automations — `/api/v1/automations/`

Feature-flagged: requires `automationsModule: true` on the org.

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | `automations:read` | List automation rules |
| POST | `/` | `automations:write` | Create rule |
| GET | `/:id` | `automations:read` | Get rule |
| PATCH | `/:id` | `automations:write` | Update rule |
| DELETE | `/:id` | `automations:write` | Delete rule |

**Automation engine** (`emitAutomationEvent`): called from service files on events like `task.assigned`, `invoice.paid`, `file.uploaded`, `project.status_changed`. Evaluates conditions and executes actions. Supported actions: `SEND_NOTIFICATION`, `SEND_EMAIL`, `CALL_WEBHOOK`, `CREATE_TASK`, `CHANGE_STATUS`, `SEND_INVOICE`.

### Clients — `/api/v1/clients/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/accept-invite` | — | Accept client portal invite (public) |
| GET | `/` | `clients:read` | List clients (paginated, filterable) |
| POST | `/` | `clients:write` | Create client |
| GET | `/:id` | `clients:read` | Get client (Redis cached 5min) |
| PATCH | `/:id` | `clients:write` | Update client |
| DELETE | `/:id` | `clients:write` | Soft-delete (sets status=SUSPENDED) |
| POST | `/:id/invite` | `clients:write` | Send portal invitation email |
| GET | `/:id/analytics` | `clients:read` | Client analytics (org-scoped) |

Email uniqueness is checked **per org** (not globally) — same email can exist in different orgs.

### Contracts — `/api/v1/contracts/`

Feature-flagged: requires `contractModule: true` on the org.

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | `contracts:read` | List contracts |
| POST | `/` | `contracts:write` | Create contract |
| GET | `/templates` | `contracts:read` | List contract templates |
| POST | `/templates` | `contracts:write` | Create template |
| GET | `/:id` | `contracts:read` | Get contract |
| PATCH | `/:id` | `contracts:write` | Update contract |
| POST | `/:id/send` | `contracts:write` | Send to client (generates PDF) |
| POST | `/:id/sign` | `contracts:read` | Sign contract (client or agency) |

### Files — `/api/v1/files/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/upload` | `files:write` | Upload file (multipart). Checks org + client storage quota. Uses org-scoped S3 key. Queues virus scan. |
| GET | `/` | `files:read` | List files (org-scoped, CLIENT sees only `isClientVisible=true`) |
| GET | `/:id` | `files:read` | Get file metadata |
| GET | `/:id/download` | `files:read` | Redirect to signed URL (validates org ownership) |
| GET | `/:id/versions` | `files:read` | Get file versions (paginated: `?page=&limit=`) |
| DELETE | `/:id` | `files:write` | Delete file + decrement org + client storage usage |
| POST | `/:id/annotations` | `files:write` | Add annotation |
| PATCH | `/:id/annotations/:aid/resolve` | `files:write` | Resolve annotation |
| DELETE | `/:id/annotations/:aid` | `files:write` | Delete annotation |

Blocked file types: `.exe .bat .cmd .sh .ps1 .vbs .js .jar`

### Invoices — `/api/v1/invoices/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/webhooks/stripe` | None | Stripe invoice webhook (raw body, rate-limited) |
| GET | `/` | `invoices:read` | List invoices (org-scoped) |
| POST | `/` | `invoices:write` | Create invoice (per-org invoice numbers) |
| GET | `/:id` | `invoices:read` | Get invoice |
| PATCH | `/:id` | `invoices:write` | Update invoice (blocked if SENT/PAID/VOID) |
| POST | `/:id/send` | `invoices:write` | Send invoice — generates PDF, sends email |
| POST | `/:id/void` | `invoices:write` | Void invoice |
| POST | `/:id/payment-link` | `invoices:read` | Create Stripe Checkout session |

### Messages — `/api/v1/messages/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | `messages:read` | Get messages by projectId or channelId |
| POST | `/` | `messages:write` | Send message (emits socket event, creates MENTION notifications) |
| GET | `/search` | `messages:read` | Full-text search |
| GET | `/channels` | `messages:read` | List channels |
| POST | `/channels` | `messages:write` | Create channel |
| GET | `/channels/:id/messages` | `messages:read` | Get channel messages |
| POST | `/channels/:id/messages` | `messages:write` | Send to channel |
| PATCH | `/:id` | `messages:write` | Edit message |
| DELETE | `/:id` | `messages:write` | Soft-delete (content replaced with `[Message deleted]`) |
| POST | `/:id/pin` | `messages:write` | Pin/unpin message |
| POST | `/:id/read` | `messages:read` | Mark as read |

### Notifications — `/api/v1/notifications/`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List notifications (org+user scoped, paginated) |
| PATCH | `/:id/read` | Mark single notification as read |
| POST | `/read-all` | Mark all as read |
| DELETE | `/:id` | Delete notification |

### Projects — `/api/v1/projects/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | `projects:read` | List projects (role-scoped: CLIENT sees own, CONTRIBUTOR sees assigned) |
| POST | `/` | `projects:write` | Create project + default channel |
| GET | `/:id` | `projects:read` | Get project |
| PATCH | `/:id` | `projects:write` | Update project |
| PATCH | `/:id/status` | `projects:write` | Update status (emits automation event) |
| POST | `/:id/milestones` | `projects:write` | Add milestone |
| PATCH | `/:id/milestones/:mid` | `projects:write` | Update milestone (COMPLETED triggers automation) |
| GET | `/:id/activity` | `projects:read` | Audit log activity for project |

**Health score computation:** `computeHealthScore(projectId, orgId)` — deducts points for overdue milestones (-15), overdue tasks (-5), missed end date (-20). Clamped to [0, 100]. Run by cron every 6h.

### Tasks — `/api/v1/tasks/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | `tasks:read` | List tasks (filterable by project/assignee/status/priority/milestone) |
| POST | `/` | `tasks:write` | Create task (notifies assignees) |
| POST | `/reorder` | `tasks:write` | Bulk reorder via `bulkWrite` |
| GET | `/:id` | `tasks:read` | Get task |
| PATCH | `/:id` | `tasks:write` | Update task (tracks completedAt/completedBy on DONE transition) |
| DELETE | `/:id` | `tasks:write` | Delete task |

---

## 11. Library Layer

### `lib/crypto.ts`

| Export | Description |
|--------|-------------|
| `encrypt(text)` | AES-256-GCM encrypt — returns `iv:tag:ciphertext` hex string |
| `decrypt(encryptedText)` | AES-256-GCM decrypt |
| `hashSHA256(data)` | SHA-256 hex digest |
| `generateSecureToken(length?)` | Cryptographically random hex token (default 32 bytes = 64 hex chars) |
| `generateOTP(length?)` | Numeric OTP (default 6 digits) |
| `hashContractSignature(content, sig, ts)` | SHA-256 of contract content + signature + timestamp |
| `generateInvoiceNumber(sequence)` | `INV-YYYY-NNNN` format |
| `generateSlug(name)` | Lowercase hyphenated slug with 3-byte random suffix |
| `timingSafeEqual(a, b)` | Constant-time string comparison |

**Security note:** `ENCRYPTION_KEY` is required in production. In development, a hardcoded fallback is used with a warning. The key must be ≥32 characters.

---

### `lib/email.ts`

Nodemailer transport setup. Supports SMTP and AWS SES. Exports `sendEmail({ to, subject, html, text? })`.

---

### `lib/emailTemplates/`

Template system with 22 HTML templates. All use the base layout from `base/layout.ts`.

**Dispatcher:** `renderEmailTemplate(type, data, branding?)` — returns `{ subject, html, text }`.

| Category | Templates |
|----------|-----------|
| `org/` | `registration-received`, `approved`, `rejected`, `trial-expiring`, `trial-expired`, `suspended`, `reactivated`, `deletion-scheduled`, `ownership-transferred`, `payment-overdue` |
| `platform/` | `new-org-pending`, `org-deletion-requested` |
| `auth/` | `magic-link`, `password-reset` |
| `team/` | `invited` |
| `client/` | `invited` |
| `invoice/` | `sent`, `overdue` |
| `contract/` | `sent` |
| `approval/` | `needed` |

**`BrandingContext`:** `{ agencyName, logoUrl?, primaryColor?, supportEmail?, frontendUrl? }` — loaded from org record when `organizationId` is provided to `enqueueEmail`.

**Transactional vs marketing classification:** `isTransactional(type)` — used for email tagging.

---

### `lib/errors.ts`

| Class | Status | Code |
|-------|--------|------|
| `AppError` | base | — |
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `AuthenticationError` | 401 | `AUTHENTICATION_ERROR` |
| `AuthorizationError` | 403 | `AUTHORIZATION_ERROR` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` |
| `PaymentError` | 402 | `PAYMENT_ERROR` |
| `RateLimitError` | 429 | `RATE_LIMIT_EXCEEDED` |
| `FileError` | 422 | `FILE_ERROR` |

All extend `AppError` with `isOperational: true` — caught by `errorHandler` and returned as structured JSON.

---

### `lib/jwt.ts`

| Export | Description |
|--------|-------------|
| `signAccessToken(payload)` | Signs org-user access token (15m) with `JWT_ACCESS_SECRET`. Payload includes `sub, email, role, orgRole, organizationId, sessionId, clientId?` |
| `verifyAccessToken(token)` | Verifies and returns `AccessTokenPayload` |
| `signRefreshToken(payload)` | Signs refresh token (7d) with `JWT_REFRESH_SECRET`. Includes `family` for rotation tracking. |
| `verifyRefreshToken(token)` | Verifies refresh token |
| `signPlatformAccessToken(payload)` | Signs platform token (1h) with `PLATFORM_JWT_ACCESS_SECRET`. Issuer: `agencyos-platform`. Includes `platformRole`, optional `impersonating`. |
| `verifyPlatformAccessToken(token)` | Verifies platform token — checks issuer |
| `signPlatformRefreshToken(payload)` | Signs platform refresh token (7d) |
| `verifyPlatformRefreshToken(token)` | Verifies platform refresh token |

### `lib/platformJwt.ts`

Re-exports `signPlatformAccessToken`, `verifyPlatformAccessToken`, `signPlatformRefreshToken`, `verifyPlatformRefreshToken` from `jwt.ts` for explicit import intent.

---

### `lib/stripe.ts`

| Export | Description |
|--------|-------------|
| `getStripe()` | Lazy-initialized Stripe client |
| `createStripeCustomer(email, name, metadata?)` | Create Stripe customer |
| `createPaymentIntent(amount, currency, customerId, metadata?)` | One-time payment intent |
| `createCheckoutSession(customerId, lineItems, successUrl, cancelUrl, metadata?)` | One-time payment checkout |
| `constructWebhookEvent(payload, signature)` | Verify + parse Stripe webhook |
| `createSubscriptionCheckout(opts)` | Subscription checkout with optional trial end |
| `createBillingPortalSession(customerId, returnUrl)` | Stripe billing portal |
| `retrieveSubscription(subscriptionId)` | Get subscription details |
| `cancelSubscriptionAtPeriodEnd(subscriptionId)` | Graceful cancellation |
| `cancelSubscriptionImmediately(subscriptionId)` | Immediate cancellation |
| `updateSubscriptionPrice(subscriptionId, newPriceId)` | Plan upgrade/downgrade with proration |
| `ensureStripeCustomer(orgId, email, name)` | Get or create Stripe customer for org |
| `getPlanFromPriceId(priceId)` | Maps Stripe price ID → `OrgPlan` |

---

### `lib/cacheInvalidation.ts`

| Export | Description |
|--------|-------------|
| `CacheGroups.user(orgId, userId)` | Keys: `org:{orgId}:user:{userId}`, `user:{userId}` |
| `CacheGroups.project(orgId, projectId)` | Keys: project + health + analytics |
| `CacheGroups.client(orgId, clientId)` | Keys: client + analytics |
| `CacheGroups.orgAnalytics(orgId)` | Keys: org analytics caches |
| `CacheGroups.orgMeta(orgId)` | Keys: `org:{orgId}:meta`, `org:{orgId}:storage-usage` |
| `invalidateCache(keys[])` | Deletes multiple keys — non-fatal |
| `purgeOrgCache(orgId)` | Deletes all `org:{orgId}:*` keys — used on suspension/deletion |
| `invalidateOrgSessions(orgId)` | Reads `org:sessions:{orgId}` SET, marks all sessions as revoked in Redis |

---

### `lib/pdf.ts`

Generates PDFs using `pdf-lib`. Exports `generateInvoicePDF(data)` and `generateContractPDF(data)`.

### `lib/passport.ts`

Google OAuth 2.0 strategy. On callback: finds user by `googleId`, then by email, or creates new user. Sets `orgRole: ORGANIZATION_OWNER` on new users. Exports `initPassport()`.

### `lib/frontendUrl.ts`

`getFrontendUrl(req)` — resolves frontend URL from `Origin` header → `Referer` header → `env.FRONTEND_URL`. Used for email links and OAuth redirects.

### `lib/logger.ts`

Pino structured logger with redaction of sensitive fields (`password`, `passwordHash`, `token`, `secret`, `authorization`). Exports `logger`.

---

## 12. Workers & Background Jobs

### `workers/emailWorker.ts`

Bull queue (`email`) for async template-based email delivery.

| Export | Description |
|--------|-------------|
| `enqueueEmail(job)` | Primary interface. Adds job to Bull queue. Falls back to synchronous send if Redis unavailable. Supports `scheduledFor` (ISO string) for delayed delivery. |
| `queueEmail(data)` | Legacy interface for raw HTML emails (backward compat). |
| `getEmailQueue()` | Returns lazy-initialized Bull queue. |

**Job payload (`EmailJob`):**
```typescript
{
  type: EmailTemplateType,
  to: string | string[],
  cc?: string[], bcc?: string[],
  data: Record<string, any>,
  organizationId?: string,   // loads org branding if provided
  scheduledFor?: string,     // ISO datetime for delayed send
  priority?: number,
  tags?: string[]
}
```

Retry: 5 attempts with exponential backoff (2s base). Keeps last 100 completed, 50 failed jobs.

---

### `workers/invoiceWorker.ts`

Bull queue (`invoice`) for async PDF generation.

- Job name: `generate-pdf`
- Generates invoice PDF using `pdf-lib`
- Uploads to org-scoped S3 key: `organizations/{orgId}/invoices/{invoiceNumber}.pdf`
- Updates `Invoice.pdfKey`
- Retry: 3 attempts, exponential backoff

---

### `workers/scanWorker.ts`

Bull queue (`file-scan`) for virus scanning.

- When `VIRUS_SCAN_ENABLED=false` (default): marks files `CLEAN` immediately
- When `VIRUS_SCAN_ENABLED=true`: downloads file from S3/R2, scans via ClamAV TCP socket (INSTREAM protocol), marks `CLEAN` or `INFECTED`
- ClamAV connection: `CLAMAV_HOST:CLAMAV_PORT` (default `localhost:3310`)
- 30s scan timeout
- Retry: 3 attempts, exponential backoff

---

### `workers/scheduledJobs.ts`

`startScheduledJobs()` registers 5 cron jobs:

| Job | Schedule | Description |
|-----|----------|-------------|
| Mark overdue invoices | Every hour `:00` | `Invoice.updateMany` — SENT/VIEWED/PARTIAL + dueDate < now → OVERDUE |
| Invoice reminders | Daily 09:00 UTC | Sends reminder emails for invoices due in 3 days |
| Project health scores | Every 6h | Recomputes `healthScore` for all ACTIVE projects |
| Platform analytics cache | Every 15 min | Pre-warms platform analytics Redis cache |
| Storage reconciliation | Daily 02:00 UTC | Recomputes actual storage from File records, corrects drift >1MB |

---

### `workers/trialLifecycleJobs.ts`

`startTrialLifecycleJobs()` registers 5 cron jobs:

| Job | Schedule | Description |
|-----|----------|-------------|
| Trial expiry enforcement | Every hour `:00` | ACTIVE + TRIAL + trialEndsAt < now → EXPIRED_TRIAL + email |
| Trial reminder T-7 days | Daily 09:00 UTC | Sends 7-day warning email |
| Trial reminder T-3 days | Daily 09:15 UTC | Sends 3-day warning email |
| Trial reminder T-1 day | Daily 09:30 UTC | Sends 1-day warning email |
| Subscription expiry + grace | Every hour `:30` | Paid orgs with expiresAt < now: grace period email → SUSPENDED after 7 days |

---

## 13. Socket.io Layer

**File:** `sockets/socketServer.ts`

### Room naming convention

| Room | Pattern | Used for |
|------|---------|---------|
| Org-wide | `organization:{orgId}` | Suspension notices, plan changes, announcements |
| Personal | `organization:{orgId}:user:{userId}` | Notifications, direct messages |
| Project | `organization:{orgId}:project:{projectId}` | Messages, file uploads, approvals, typing |

Legacy rooms (`org:{orgId}:*`, `user:{userId}`, `project:{projectId}`) kept for backward compat — marked for removal in Phase 9.

### Redis adapter

`@socket.io/redis-adapter` enabled when Redis is available. Uses `getRedisPublisher()` and `getRedisSubscriber()`. Enables horizontal scaling across multiple Node.js instances.

### Authentication

JWT verified on connection via `socket.handshake.auth.token` or `Authorization` header. Supports both org tokens and platform tokens (for impersonation).

### Client events

| Event | Payload | Description |
|-------|---------|-------------|
| `join:project` | `projectId` | Join org-namespaced project room |
| `leave:project` | `projectId` | Leave project room |
| `typing:start` | `{ projectId, channelId }` | Broadcast typing indicator to project room |
| `typing:stop` | `{ projectId, channelId }` | Stop typing indicator |
| `presence:update` | `'online' \| 'away' \| 'offline'` | Broadcast presence to org room |

### Server emit helpers

| Export | Description |
|--------|-------------|
| `emitToOrg(orgId, event, data)` | Broadcast to all org sockets |
| `emitToOrgProject(orgId, projectId, event, data)` | Broadcast to project room |
| `emitToOrgUser(orgId, userId, event, data)` | Send to specific user |
| `getSocketServer()` | Returns the Socket.io server instance |

---

## 14. Migration Scripts

Run order: `001` → `002` → `003`

```bash
npm run migrate:001   # Add compound indexes
npm run migrate:002   # Backfill organizationId on legacy data
npm run migrate:003   # Migrate S3 keys to org-scoped format
npm run migrate:all   # Run all three in sequence
```

### `001_add_organizationId_indexes.ts`

Creates all compound indexes across 15 collections. **Idempotent** — skips existing indexes. Safe to run multiple times. Does not modify any documents.

### `002_backfill_organizationId.ts`

For single-tenant → multi-tenant upgrades:
1. Finds or creates a default `Organization` from the first SUPERADMIN user
2. Backfills `organizationId` on all 15 collections in batches of 500
3. Updates org usage counters (seats, projects, clients)

**Idempotent** — only updates documents where `organizationId` is missing.

### `003_migrate_storage_keys.ts`

Migrates S3/R2 file keys from `projects/{projectId}/...` to `organizations/{orgId}/projects/{projectId}/...`.

- Processes files in batches of 100
- Copies object to new key, updates DB, deletes old key
- Skips files already using org-scoped keys
- `DRY_RUN=true` mode for preview without changes
- Exits with code 1 if any files failed (re-run to retry)

---

## 15. API Route Reference

### Org-user routes (prefix: `/api/v1/`)

| Module | Base Path |
|--------|-----------|
| Auth | `/auth/` |
| Organizations | `/organizations/` |
| Clients | `/clients/` |
| Projects | `/projects/` |
| Tasks | `/tasks/` |
| Files | `/files/` |
| Messages | `/messages/` |
| Invoices | `/invoices/` |
| Contracts | `/contracts/` |
| Approvals | `/approvals/` |
| Notifications | `/notifications/` |
| Automations | `/automations/` |
| Analytics | `/analytics/` |
| Admin | `/admin/` |

### Platform routes (prefix: `/api/platform/`)

| Sub-module | Base Path |
|-----------|-----------|
| Bootstrap | `/bootstrap` |
| Auth | `/auth/` |
| Organizations | `/organizations/` |
| Analytics | `/analytics/` |
| Users | `/users/` |
| Impersonation | `/impersonation/` |
| Billing | `/billing/` |
| Feature Flags | `/flags/` |

### System routes

| Path | Description |
|------|-------------|
| `GET /health` | Health check — returns `{ status, version, env, timestamp }` |

---

## 16. Redis Key Namespace Reference

| Key Pattern | TTL | Description |
|-------------|-----|-------------|
| `user:{userId}` | 5 min | Org user cache |
| `org:{orgId}:meta` | 5 min | Organization metadata cache |
| `org:sessions:{orgId}` | 7 days | SET of active session IDs for bulk revocation |
| `org:{orgId}:user:{userId}` | — | Org-namespaced user cache (new format) |
| `org:{orgId}:project:{projectId}` | — | Project cache |
| `org:{orgId}:analytics:*` | varies | Org analytics caches |
| `refresh:{sessionId}` | 7 days | Org user refresh token hash |
| `revoked:session:{sessionId}` | 24h | Revoked org session marker |
| `revoked:family:{family}` | 24h | Revoked token family marker |
| `magic:{hash}` | 72h | Magic link token |
| `pwreset:{hash}` | 1h | Password reset token |
| `invite:{hash}` | 72h | Client invite token |
| `rate:api:{orgId}` | 60s | Org API rate limit counter |
| `rate:org-register:{ip}` | 1h | Registration rate limit counter |
| `platform:user:{userId}` | 5 min | Platform user cache |
| `platform:refresh:{sessionId}` | 7 days | Platform refresh token hash |
| `platform:revoked:session:{id}` | 24h | Revoked platform session |
| `platform:revoked:family:{family}` | 24h | Revoked platform token family |
| `platform:impersonation:{sessionId}` | 1h | Active impersonation session data |
| `platform:analytics:overview` | 5 min | Platform overview cache |
| `platform:analytics:funnel` | 30 min | Onboarding funnel cache |
| `platform:analytics:mrr` | 1h | MRR trend cache |
| `platform:analytics:storage:{limit}` | 15 min | Storage breakdown cache |
| `platform:analytics:ranking:*` | 5 min | Org ranking cache |
| `platform:analytics:api-usage:{limit}` | 1 min | API usage cache |

---

## 17. Storage Key Conventions

### New format (org-scoped — all new uploads)

```
organizations/{orgId}/projects/{projectId}/{folder}/{timestamp}-{filename}
organizations/{orgId}/invoices/{timestamp}-{invoiceNumber}.pdf
organizations/{orgId}/contracts/{timestamp}-{contractId}.pdf
organizations/{orgId}/assets/{timestamp}-{filename}
organizations/{orgId}/exports/{timestamp}-{filename}
```

### Legacy format (pre-migration — still supported)

```
projects/{projectId}/{folder}/{timestamp}_{filename}
invoices/{timestamp}_{invoiceNumber}.pdf
```

Legacy keys are allowed through `getOrgSignedDownloadUrl` with a warning log. Run migration 003 to convert them.

### Cross-tenant protection

`validateStorageKeyOwnership(key, orgId)` — returns `false` if key doesn't start with `organizations/{orgId}/`. Called before every signed URL generation and file deletion.

---

## 18. Role & Permission Matrix

### Org Roles

| Permission | OWNER | ADMIN | PM | CONTRIBUTOR | CLIENT |
|-----------|-------|-------|-----|-------------|--------|
| clients:read/write | ✅/✅ | ✅/✅ | ✅/— | —/— | —/— |
| projects:read/write | ✅/✅ | ✅/✅ | ✅/✅ | ✅/— | ✅/— |
| tasks:read/write | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅/— |
| files:read/write | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅/— |
| messages:read/write | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ |
| invoices:read/write | ✅/✅ | ✅/✅ | ✅/— | —/— | ✅/— |
| contracts:read/write | ✅/✅ | ✅/✅ | ✅/— | —/— | ✅/— |
| approvals:read/write | ✅/✅ | ✅/✅ | ✅/✅ | ✅/— | ✅/✅ |
| team:read/write | ✅/✅ | ✅/✅ | ✅/— | —/— | —/— |
| analytics:read/write | ✅/✅ | ✅/✅ | ✅/— | —/— | —/— |
| automations:read/write | ✅/✅ | ✅/✅ | —/— | —/— | —/— |
| admin:read/write | ✅/✅ | ✅/✅ | —/— | —/— | —/— |
| billing:read/write | ✅/✅ | ✅/— | —/— | —/— | —/— |
| settings:read/write | ✅/✅ | ✅/✅ | —/— | —/— | —/— |
| org:delete | ✅ | — | — | — | — |

### Platform Roles

| Permission | PLATFORM_OWNER | PLATFORM_ADMIN | PLATFORM_SUPPORT |
|-----------|---------------|----------------|-----------------|
| platform:* (wildcard) | ✅ | — | — |
| orgs:read/write/delete | ✅/✅/✅ | ✅/✅/— | ✅/—/— |
| billing:read/write | ✅/✅ | ✅/— | ✅/— |
| impersonate | ✅ | ✅ | readonly |
| feature-flags:read/write | ✅/✅ | ✅/— | —/— |
| platform-users:read/write | ✅/✅ | ✅/— | —/— |

---

## 19. Multi-Tenancy Architecture

### Tenant isolation layers

| Layer | Mechanism |
|-------|-----------|
| **Database** | Every query includes `organizationId` as first filter. Compound indexes start with `organizationId`. |
| **Auth** | JWT payload carries `organizationId`. `tenantScope` middleware validates org status on every request. |
| **Storage** | S3/R2 keys prefixed with `organizations/{orgId}/`. `validateStorageKeyOwnership` prevents cross-tenant key access. |
| **Cache** | All org data cached under `org:{orgId}:*` namespace. |
| **WebSocket** | Rooms namespaced as `organization:{orgId}:*`. No cross-tenant broadcasts possible. |
| **Rate limiting** | Per-org rate limits tracked under `rate:api:{orgId}`. |
| **Sessions** | Sessions tracked in `org:sessions:{orgId}` SET for bulk revocation on suspension. |

### Org lifecycle state machine

```
PENDING_APPROVAL
    │
    ├─ approve() ──→ ACTIVE (trial starts, 14 days)
    │                   │
    │                   ├─ trialEndsAt reached ──→ EXPIRED_TRIAL
    │                   │                              │
    │                   │                              └─ subscribe() ──→ ACTIVE (paid)
    │                   │
    │                   ├─ subscribe() ──→ ACTIVE (paid)
    │                   │                   │
    │                   │                   ├─ payment_failed + grace ──→ SUSPENDED
    │                   │                   └─ subscription.deleted ──→ EXPIRED_TRIAL
    │                   │
    │                   └─ suspend() ──→ SUSPENDED
    │                                       │
    │                                       └─ reactivate() ──→ ACTIVE
    │
    ├─ reject() ──→ REJECTED
    │
    └─ requestDeletion() ──→ ARCHIVED (30-day grace)
```

### Platform user vs org user

| Aspect | Org User | Platform User |
|--------|----------|---------------|
| Model | `User` | `PlatformUser` |
| JWT secret | `JWT_ACCESS_SECRET` | `PLATFORM_JWT_ACCESS_SECRET` |
| JWT issuer | default | `agencyos-platform` |
| Routes | `/api/v1/*` | `/api/platform/*` |
| Middleware | `authenticate` | `authenticatePlatform` |
| Tenant scope | Required | Bypassed (unless impersonating) |
| Redis cache | `user:{id}` | `platform:user:{id}` |

---

## 20. Security Hardening Summary

| Measure | Implementation |
|---------|---------------|
| Password hashing | argon2id (memoryCost: 64MB, timeCost: 3, parallelism: 4) |
| JWT rotation | Refresh token rotation with token family revocation on reuse detection |
| Session revocation | Redis-based revocation list for both org and platform sessions |
| Bulk session revocation | `org:sessions:{orgId}` SET — revoke all sessions on org suspension |
| CSRF protection | Double-submit cookie pattern (`csrf-token` cookie + `X-CSRF-Token` header) |
| NoSQL injection | `express-mongo-sanitize` on all requests |
| HTTP Parameter Pollution | `hpp` middleware |
| Security headers | `helmet` with CSP |
| Rate limiting | 5 limiters + plan-based org limiter |
| Stripe webhook security | Signature verification via `constructWebhookEvent` + rate limiting |
| Storage isolation | Org-prefixed S3 keys + ownership validation before every signed URL |
| Cross-tenant protection | `assertSameOrg()` in service functions + `tenantScope` on all routes |
| Encryption key | Required in production — throws on startup if missing |
| Virus scanning | ClamAV via TCP socket (INSTREAM protocol) — configurable |
| Audit trail | Immutable `AuditLog` for all write operations |
| Impersonation safety | 1h TTL, audit logged, read-only mode for PLATFORM_SUPPORT |
| Email enumeration | Magic link and forgot-password silently succeed for unknown emails |
| File type blocking | `.exe .bat .cmd .sh .ps1 .vbs .js .jar` blocked at upload |
| Signed URLs | 5-minute expiry, org ownership validated before signing |

---

## 21. Deployment Checklist

### First-time setup

```bash
# 1. Set all required environment variables (see Section 3)
# 2. Start the server
npm run build && npm start

# 3. Bootstrap the first platform owner (one-time)
curl -X POST https://your-api.com/api/platform/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@youragency.com","name":"Admin","password":"SecurePass123!"}'

# 4. Run database migrations (for existing single-tenant data)
npm run migrate:001   # Add indexes (safe to run on empty DB too)
npm run migrate:002   # Backfill organizationId (skip if fresh install)
npm run migrate:003   # Migrate S3 keys (skip if fresh install)
```

### Production environment variables (must change from defaults)

```bash
PLATFORM_JWT_ACCESS_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
PLATFORM_JWT_REFRESH_SECRET=<generate same way>
JWT_ACCESS_SECRET=<generate same way>
JWT_REFRESH_SECRET=<generate same way>
ENCRYPTION_KEY=<generate same way>
SESSION_SECRET=<generate same way>
```

### Infrastructure requirements

| Service | Minimum | Recommended |
|---------|---------|-------------|
| Node.js | 18 | 20 LTS |
| MongoDB | 6.0 | 7.0 |
| Redis | 6.0 | 7.0 (Upstash works) |
| ClamAV | optional | Required if `VIRUS_SCAN_ENABLED=true` |

### Health check

```
GET /health
→ { status: "ok", version: "1.0.0", env: "production", timestamp: "..." }
```

---

## 22. Known Gaps & Future Work

| Item | Priority | Notes |
|------|----------|-------|
| Load testing | HIGH | Run k6/Artillery: 100 concurrent orgs, 1000 req/s before production launch |
| Security penetration test | HIGH | Cross-tenant access attempts, JWT manipulation, storage key injection |
| Production migration execution | HIGH | Run `npm run migrate:all` in off-peak window on staging first |
| Full integration test suite | MEDIUM | Current tests cover core modules; expand to all 13 × multi-tenant scenarios |
| Real virus scanning | MEDIUM | Set `VIRUS_SCAN_ENABLED=true` and deploy ClamAV daemon or use AWS Malware Protection |
| Socket.io legacy room removal | LOW | `user:{userId}` and `project:{projectId}` rooms still joined for backward compat — remove in next major version |
| Google OAuth org assignment | LOW | Currently auto-creates a standalone org for OAuth users — replace with org registration flow |
| `User.organizationId` required enforcement | LOW | Currently `sparse: true` — change to `required: true` after migration 002 runs on all data |
| Razorpay payment gateway | LOW | Credentials in env but no webhook handler implemented |
| SSO / SAML | LOW | `ssoEnabled` feature flag exists but no implementation |
| White-label / custom domain | LOW | Feature flags exist but no implementation |
| API access tokens | LOW | `apiAccess` feature flag exists but no API key system implemented |
