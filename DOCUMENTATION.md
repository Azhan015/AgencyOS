# AgencyOS Backend — Full Codebase Audit & Documentation

> **Audit Date:** May 22, 2026  
> **Codebase:** `backend/src/` — TypeScript, Express 4, MongoDB/Mongoose 8, Socket.io 4  
> **Version:** 1.0.0

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Directory Structure](#3-directory-structure)
4. [Application Boot Flow](#4-application-boot-flow)
5. [Configuration Layer](#5-configuration-layer)
6. [Middleware Pipeline](#6-middleware-pipeline)
7. [Data Models](#7-data-models)
8. [Module-by-Module Audit](#8-module-by-module-audit)
   - [Auth](#81-auth-module)
   - [Clients](#82-clients-module)
   - [Projects](#83-projects-module)
   - [Tasks](#84-tasks-module)
   - [Files](#85-files-module)
   - [Messages](#86-messages-module)
   - [Invoices](#87-invoices-module)
   - [Contracts](#88-contracts-module)
   - [Approvals](#89-approvals-module)
   - [Notifications](#810-notifications-module)
   - [Automations](#811-automations-module)
   - [Analytics](#812-analytics-module)
   - [Admin](#813-admin-module)
9. [Library Layer (lib/)](#9-library-layer)
10. [Workers & Background Jobs](#10-workers--background-jobs)
11. [Real-time Layer (Socket.io)](#11-real-time-layer-socketio)
12. [API Route Reference](#12-api-route-reference)
13. [Role-Based Access Control](#13-role-based-access-control)
14. [Error Handling](#14-error-handling)
15. [Security Audit](#15-security-audit)
16. [Findings & Recommendations](#16-findings--recommendations)

---

## 1. Project Overview

AgencyOS is a full-featured **agency management platform** backend. It provides a REST API and real-time WebSocket layer for managing the complete lifecycle of an agency's operations:

- **Client onboarding** — invite clients, manage portal access
- **Project management** — milestones, health scores, activity logs
- **Task tracking** — Kanban-style with assignees, priorities, dependencies
- **File management** — versioned uploads to S3/R2 with virus scanning
- **Messaging** — project channels with real-time delivery
- **Invoicing** — PDF generation, Stripe checkout, overdue automation
- **Contracts** — digital signatures, PDF export, template system
- **Approvals** — deliverable review workflow with revision tracking
- **Notifications** — in-app + email, real-time via Socket.io
- **Automations** — event-driven rule engine
- **Analytics** — agency, project, and client dashboards

---

## 2. Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Runtime | Node.js | ≥18 |
| Language | TypeScript | 5.3.3 |
| Framework | Express | 4.18.2 |
| Database | MongoDB (Mongoose) | 8.0.3 |
| Cache / Sessions | Redis (ioredis) | 5.3.2 |
| Real-time | Socket.io | 4.6.2 |
| Job Queue | Bull | 4.12.2 |
| Auth | JWT (jsonwebtoken) | 9.0.2 |
| Password Hashing | argon2id | 0.31.2 |
| OAuth | Passport + Google OAuth 2.0 | 0.7.0 |
| File Storage | AWS S3 / Cloudflare R2 | SDK v3 |
| Payments | Stripe | 14.10.0 |
| PDF Generation | pdf-lib | 1.17.1 |
| Email | Nodemailer | 6.9.8 |
| Validation | Zod | 3.22.4 |
| Logging | Pino | 8.17.2 |
| Scheduling | node-cron | 3.0.3 |
| Testing | Jest + mongodb-memory-server | 29.7.0 |

---

## 3. Directory Structure

```
backend/src/
├── app.ts                    # Express app factory — middleware + route mounting
├── server.ts                 # HTTP server bootstrap — DB, Redis, Socket.io, cron
│
├── config/
│   ├── bullRedis.ts          # ioredis options for Bull queues (TLS-aware)
│   ├── db.ts                 # MongoDB connect/disconnect with retry logic
│   ├── env.ts                # Zod-validated environment variables (fails fast)
│   ├── redis.ts              # Redis client pool + graceful-degradation cache helpers
│   └── storage.ts            # S3/R2 client — upload, download, signed URLs, multipart
│
├── lib/
│   ├── crypto.ts             # AES-256-GCM encrypt/decrypt, SHA-256, tokens, slugs
│   ├── email.ts              # Nodemailer transport + 8 HTML email templates
│   ├── errors.ts             # AppError class hierarchy (8 error types)
│   ├── frontendUrl.ts        # Request-aware frontend URL resolver (Origin > Referer > env)
│   ├── jwt.ts                # Access token (15m) + refresh token (7d) sign/verify
│   ├── logger.ts             # Pino logger with redaction of secrets
│   ├── passport.ts           # Google OAuth 2.0 strategy (find-or-create)
│   ├── pdf.ts                # Invoice PDF + Contract PDF generation (pdf-lib)
│   └── stripe.ts             # Stripe client — customer, payment intent, checkout, webhook
│
├── middleware/
│   ├── auditLog.ts           # Factory: creates audit log entry for any route
│   ├── authenticate.ts       # JWT Bearer auth + Redis session revocation check
│   ├── authorize.ts          # RBAC: permission-based + role-based guards
│   ├── errorHandler.ts       # Global error handler + 404 handler
│   ├── rateLimiter.ts        # 4 rate limit presets (general/auth/upload/strict)
│   ├── requestId.ts          # Injects X-Request-ID header (UUID)
│   └── validate.ts           # Zod schema validation for body/query/params
│
├── models/
│   ├── Approval.ts           # Approval workflow model
│   ├── AuditLog.ts           # Immutable audit trail
│   ├── AutomationRule.ts     # Event-driven automation rules
│   ├── Brief.ts              # Project brief Q&A
│   ├── Channel.ts            # Messaging channels
│   ├── Client.ts             # Client accounts with storage quotas
│   ├── Contract.ts           # Contracts with digital signatures
│   ├── ContractTemplate.ts   # Reusable contract templates
│   ├── File.ts               # Files with versioning + annotations
│   ├── Invoice.ts            # Invoices with payment tracking
│   ├── Message.ts            # Messages with read receipts
│   ├── Notification.ts       # In-app notifications (90-day TTL)
│   ├── Project.ts            # Projects with milestones + health score
│   ├── Task.ts               # Tasks (Kanban)
│   └── User.ts               # Users with argon2id passwords + device tracking
│
├── modules/
│   ├── admin/                # Team management, audit logs, DB health
│   ├── analytics/            # Agency/project/client analytics
│   ├── approvals/            # Deliverable approval workflow
│   ├── auth/                 # Authentication (JWT, magic link, OAuth, password)
│   ├── automations/          # Automation rule CRUD + event engine
│   ├── clients/              # Client CRUD + invite flow
│   ├── contracts/            # Contract lifecycle + signing
│   ├── files/                # File upload/management
│   ├── invoices/             # Invoice lifecycle + Stripe payments
│   ├── messages/             # Real-time messaging
│   ├── notifications/        # Notification management
│   ├── projects/             # Project management
│   └── tasks/                # Task management
│
├── sockets/
│   └── socketServer.ts       # Socket.io server — JWT auth, rooms, events
│
├── types/
│   └── express.d.ts          # Global Express.User type augmentation
│
└── workers/
    ├── emailWorker.ts        # Bull queue: async email delivery
    ├── invoiceWorker.ts      # Bull queue: invoice PDF generation
    ├── scanWorker.ts         # Bull queue: virus scanning
    └── scheduledJobs.ts      # node-cron: overdue invoices, reminders, health scores
```

---

## 4. Application Boot Flow

```
server.ts → bootstrap()
    │
    ├─ 1. connectDB()          MongoDB connection with retry (max 5, 5s delay)
    ├─ 2. connectRedis()       Redis connection (5s timeout, non-fatal if fails)
    ├─ 3. http.createServer(app)
    ├─ 4. initSocketServer()   Socket.io attached to HTTP server
    ├─ 5. startScheduledJobs() node-cron jobs registered
    └─ 6. httpServer.listen()  Port from env.PORT (default 5000)
         │
         └─ Graceful shutdown on SIGTERM/SIGINT:
              httpServer.close() → disconnectDB() → disconnectRedis() → exit(0)
              Force exit after 30s timeout
```

### app.ts Middleware Stack (in order)

```
1.  trust proxy = 1              (correct IP behind load balancer)
2.  helmet()                     (security headers + CSP)
3.  cors()                       (whitelist: FRONTEND_URL, localhost:3000, localhost:5173)
4.  express.raw()                (Stripe webhook — raw body BEFORE json parser)
5.  express.json({ limit:10mb })
6.  express.urlencoded()
7.  cookieParser()
8.  compression()
9.  mongoSanitize()              (NoSQL injection prevention)
10. initPassport() + passport.initialize()
11. requestId()                  (X-Request-ID header)
12. generalLimiter()             (rate limiting, skips Stripe webhook path)
13. GET /health                  (no auth)
14. POST /api/v1/auth/bootstrap-superadmin  (one-time setup)
15. POST /api/v1/auth/dev-set-password      (dev only)
16. Route modules at /api/v1/...
17. notFoundHandler()
18. errorHandler()               (must be last)
```

---

## 5. Configuration Layer

### `config/env.ts`
Validates all environment variables at startup using Zod. **Process exits immediately** if any required variable is missing or invalid. Key variables:

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `MONGODB_URI` | ✅ | — | MongoDB connection string |
| `JWT_ACCESS_SECRET` | ✅ (≥32 chars) | — | Access token signing |
| `JWT_REFRESH_SECRET` | ✅ (≥32 chars) | — | Refresh token signing |
| `REDIS_URL` | — | `redis://localhost:6379` | Redis (use `rediss://` for TLS) |
| `FRONTEND_URL` | — | `http://localhost:3000` | CORS + email links |
| `STRIPE_SECRET_KEY` | — | — | Stripe payments |
| `GOOGLE_CLIENT_ID/SECRET` | — | — | Google OAuth |
| `AWS_ACCESS_KEY_ID` | — | — | S3 storage |
| `R2_ENDPOINT` | — | — | Cloudflare R2 (overrides S3) |
| `SMTP_HOST` | — | — | Email delivery |
| `AGENCY_NAME` | — | `Agency OS` | Branding in emails/PDFs |
| `ENCRYPTION_KEY` | — (≥32 chars) | — | AES-256-GCM encryption |
| `VIRUS_SCAN_ENABLED` | — | `false` | ClamAV virus scanning |

### `config/db.ts`
- Connection pool: min 5, max 20 connections
- Retry logic: 5 attempts, 5s delay between retries
- Logs connection events (error, disconnect, reconnect)

### `config/redis.ts`
- Creates 3 clients: main, subscriber, publisher (for Socket.io Redis adapter)
- TLS auto-detected from `rediss://` URL scheme
- Keep-alive pings every 10s (prevents Upstash idle disconnects)
- **Graceful degradation**: all cache helpers (`cacheGet/cacheSet/cacheDel`) silently no-op when Redis is unavailable
- `isRedisAvailable()` flag used throughout the app to skip Redis-dependent features

### `config/storage.ts`
- Supports both **AWS S3** and **Cloudflare R2** (R2 takes priority if `R2_ENDPOINT` is set)
- Server-side encryption: `AES256` on all uploads
- Signed download URLs (default 5-minute expiry)
- Full multipart upload support for large files
- `generateStorageKey(prefix, filename)` — timestamp-prefixed, sanitized keys

### `config/bullRedis.ts`
- Parses `REDIS_URL` into ioredis-compatible options
- Handles TLS (`rediss://`) by setting `tls: {}`
- `maxRetriesPerRequest: null` — lets Bull manage retries

---

## 6. Middleware Pipeline

### `authenticate.ts`
```
Request → Extract Bearer token from Authorization header
        → verifyAccessToken() (JWT signature + expiry)
        → Check Redis: revoked:session:{sessionId} (if Redis available)
        → Check Redis cache: user:{userId} (5-min TTL)
        → If cache miss: User.findById() + cache result
        → Set req.user = { id, email, role, clientId, sessionId, name }
        → next()
```

### `authorize.ts`
Two guard factories:
- `authorize(...permissions)` — checks `ROLE_PERMISSIONS[role]` includes ALL required permissions
- `authorizeRoles(...roles)` — checks role is in allowed list

Permission matrix (see Section 13 for full table).

### `validate.ts`
Wraps Zod schemas. On failure, throws `ValidationError` with field-level details from `error.flatten().fieldErrors`.

### `rateLimiter.ts`
| Limiter | Window | Max Requests | Used On |
|---------|--------|-------------|---------|
| `generalLimiter` | 60s (configurable) | 200 (configurable) | All `/api/` routes |
| `authLimiter` | 60s | 10 | register, login, magic-link/verify, reset-password, Google OAuth |
| `uploadLimiter` | 60s | 20 | File upload endpoint |
| `strictLimiter` | 60s | 5 | magic-link send, forgot-password |

All limiters are **disabled in test environment** (`NODE_ENV === 'test'`).

### `auditLog.ts`
Factory middleware: `auditLog(action, resource)` — creates an `AuditLog` document with userId, action, resource, resourceId, IP, user-agent. Errors are caught and logged but never propagate.

### `requestId.ts`
Reads `X-Request-ID` header or generates a UUID. Sets it on both `req.headers` and the response `X-Request-ID` header.

### `errorHandler.ts`
Handles in order:
1. `ZodError` → 400 with field errors
2. `mongoose.Error.ValidationError` → 400 with field details
3. MongoDB duplicate key (code 11000) → 409 Conflict
4. `mongoose.Error.CastError` (invalid ObjectId) → 400
5. `AppError` (operational) → appropriate status code
6. Unknown errors → 500 (stack trace hidden in production)

---

## 7. Data Models

### User
```
email (unique, indexed)
passwordHash (select: false, argon2id)
name
avatar?
role: SUPERADMIN | ADMIN | PROJECT_MANAGER | CONTRIBUTOR | CLIENT
clientId? → Client (indexed)
isActive: boolean
lastLoginAt?
devices[]: { deviceId, userAgent, lastSeenAt, ipAddress }
notificationPrefs: { email: { immediate, digest }, inApp, push }
googleId? (sparse index)
```
- `toSafeObject()` strips passwordHash, reset tokens, __v
- `findByEmail()` static — case-insensitive lookup
- Pre-save hook: hashes plain-text passwordHash if not already argon2 format
- Max 5 devices per user (oldest evicted)

### Client
```
slug (unique, indexed)
companyName, contactName, email (indexed), phone?, website?
tier: STARTER | GROWTH | ENTERPRISE
status: INVITED | ONBOARDING | ACTIVE | SUSPENDED
assignedPM? → User
storageUsedBytes: 0
storageLimitBytes: 5GB/50GB/500GB (by tier)
stripeCustomerId? (sparse)
metadata: Mixed
```

### Project
```
name, slug (unique)
clientId → Client (indexed)
type: WEBSITE | BRANDING | CAMPAIGN | CUSTOM
status: SCOPING | ACTIVE | REVIEW | COMPLETED | ARCHIVED
pm → User (required)
contributors[]: User[]
budget, currency
startDate?, endDate?
milestones[]: { name, dueDate, status, invoiceAmount, triggerInvoice, completedAt, order }
healthScore: 0-100 (default 100)
brief? → Brief
tags[]
```

### Task
```
projectId → Project (indexed)
milestoneId?
title, description?
status: BACKLOG | IN_PROGRESS | REVIEW | DONE
priority: LOW | MEDIUM | HIGH | URGENT
assignees[]: User[]
dueDate?, completedAt?, completedBy? → User
dependencies[]: Task[]
tags[], order
createdBy → User
```

### Invoice
```
invoiceNumber (unique, indexed, format: INV-YYYY-NNNN)
clientId → Client (indexed)
projectId?, milestoneId?
status: DRAFT | SENT | VIEWED | PARTIAL | PAID | OVERDUE | VOID
lineItems[]: { description, quantity, unitPrice, amount }
subtotal, tax, taxRate, discount, total
currency (default USD)
dueDate (required), issuedAt?, viewedAt?, paidAt?
paymentGateway?: STRIPE | RAZORPAY | MANUAL
paymentIntentId?, checkoutSessionId?, receiptUrl?, pdfKey?
remindersSent[]: Date[]
notes?, createdBy → User
```

### Contract
```
clientId → Client (indexed)
projectId?, templateId?
type: NDA | SOW | RETAINER | CHANGE_ORDER
status: DRAFT | SENT | VIEWED | SIGNED | EXECUTED | EXPIRED
title, content, variables: Mixed
clientSignature?: { svg, signedAt, ipAddress, userAgent, hash, signerName }
agencySignature?: { svg, signedAt, ipAddress, userAgent, hash, signerName }
expiresAt?, pdfKey?, sentAt?, viewedAt?
createdBy → User
```

### Approval
```
projectId → Project (indexed)
milestoneId?
fileIds[]: File[]
submittedBy → User
status: PENDING | IN_REVIEW | APPROVED | REJECTED | REVISION_REQUESTED
submissionNote?, dueDate?
revisions[]: { note, fileIds[], requestedAt, resolvedAt? }
approvedBy? → User, approvedAt?
rejectionReason?, title
```

### File
```
projectId → Project (indexed)
clientId → Client (indexed)
uploadedBy → User
name, originalName, mimeType, sizeBytes
storageKey (S3/R2 key)
folder (default '/')
version (default 1), parentFileId? → File
isClientVisible: boolean
scanStatus: PENDING | CLEAN | INFECTED | FAILED
annotations[]: { x, y, pageNum, comment, authorId, resolvedAt?, createdAt }
downloadCount, thumbnailKey?
```

### Message
```
projectId → Project (indexed)
channelId (indexed)
senderId → User
content (max 10000 chars)
contentType: TEXT | FILE | SYSTEM
attachments[]: File[], mentions[]: User[]
isPinned, readBy[]: { userId, readAt }
editedAt?, deletedAt?, replyTo? → Message
```
- Text index on `content` for full-text search
- Soft delete: `deletedAt` set, content replaced with `[Message deleted]`

### Channel
```
projectId? → Project (indexed)
name, type: PROJECT | DIRECT | ANNOUNCEMENT
members[]: User[]
createdBy → User
isArchived: boolean
lastMessageAt?
```

### Notification
```
userId → User (indexed)
type: TASK_ASSIGNED | FILE_UPLOADED | INVOICE_DUE | INVOICE_PAID |
      MESSAGE_RECEIVED | APPROVAL_NEEDED | APPROVAL_UPDATED |
      CONTRACT_SIGNED | CONTRACT_SENT | PROJECT_STATUS_CHANGED |
      MILESTONE_COMPLETED | MENTION | SYSTEM
title, body, link?
isRead: boolean, readAt?
metadata: Mixed
```
- **TTL index**: auto-deleted after 90 days (`expireAfterSeconds: 7776000`)

### AutomationRule
```
name, description?, isActive
trigger: { event: TriggerEvent, conditions[]: { field, operator, value } }
actions[]: { type: ActionType, params: Mixed }
lastRunAt?, runCount, errorCount
createdBy → User
```
- Index on `{ isActive: 1, 'trigger.event': 1 }` for fast rule lookup

### AuditLog
```
userId → User (indexed)
action, resource, resourceId?
before?: Mixed, after?: Mixed
ip?, userAgent?, metadata?
createdAt (no updatedAt)
```
- Indexes: `{ userId, createdAt }`, `{ resource, resourceId }`, `{ createdAt }`

### Brief
```
projectId → Project, clientId → Client
title
questions[]: { question, answer, type: text|textarea|select|multiselect }
completedAt?, createdBy → User
```

### ContractTemplate
```
name, type: NDA|SOW|RETAINER|CHANGE_ORDER
content (with {{variable}} placeholders)
variables[]: string[]
isDefault: boolean
createdBy → User
```

---

---

## 8. Module-by-Module Audit

### 8.1 Auth Module

**Files:** `auth.routes.ts`, `auth.controller.ts`, `auth.service.ts`

#### Routes
| Method | Path | Rate Limit | Auth | Description |
|--------|------|-----------|------|-------------|
| POST | `/register` | authLimiter | — | Register new user |
| POST | `/login` | authLimiter | — | Email + password login |
| POST | `/refresh` | — | — | Rotate refresh token |
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
| POST | `/dev-set-password` | — | — | Dev-only password set |

#### Auth Flow — Password Login
```
POST /login
  → Validate body (Zod: email, password)
  → User.findOne({ email }).select('+passwordHash')
  → argon2.verify(passwordHash, password)
  → updateDeviceList() — max 5 devices, evict oldest
  → generateTokenPair() → signAccessToken() + signRefreshToken()
  → Store refresh token hash in Redis: refresh:{sessionId} (7d TTL)
  → Set refreshToken httpOnly cookie (7d)
  → Return { accessToken, user }
```

#### Auth Flow — Token Refresh
```
POST /refresh
  → Read refreshToken from cookie or body
  → verifyRefreshToken() — JWT signature + expiry
  → Check Redis: revoked:family:{family} (token family revoked?)
  → Check Redis: refresh:{sessionId} — compare stored hash
  → If hash mismatch: revokeTokenFamily() + throw (reuse detected)
  → Delete old token from Redis
  → generateTokenPair() with new sessionId, same family
  → Return new accessToken + set new refreshToken cookie
```

#### Auth Flow — Magic Link
```
POST /magic-link
  → Find user by email (silent fail if not found — prevents enumeration)
  → If Redis available: store random token hash (72h TTL)
  → If Redis unavailable: sign JWT with sessionId='magic' (fallback)
  → Send email with link to /auth/magic?token=...

POST /magic-link/verify
  → Hash token → lookup in Redis
  → If Redis miss: try verifyAccessToken() (JWT fallback path)
  → Find user, update device list, generate token pair
```

#### Auth Flow — Google OAuth
```
GET /google
  → Encode frontend origin in base64url state param
  → Redirect to Google consent screen

GET /google/callback
  → Decode state → recover frontend origin
  → Passport GoogleStrategy: find by googleId → find by email → create new user
  → Generate token pair → set refreshToken cookie
  → Redirect to {frontendOrigin}/auth/google/callback#token={accessToken}
```

#### Security Notes
- Passwords hashed with **argon2id** (memoryCost: 64MB, timeCost: 3, parallelism: 4)
- Refresh tokens use **token rotation** — each use issues a new token
- **Token family revocation** — reuse detection revokes all sessions in the family
- Magic link tokens are **single-use** (deleted from Redis on verify)
- Email enumeration prevented on magic-link and forgot-password endpoints
- `dev-set-password` endpoint returns 403 in production

---

### 8.2 Clients Module

**Files:** `clients.routes.ts`, `clients.controller.ts`, `clients.service.ts`

#### Routes
| Method | Path | Auth | Permission | Description |
|--------|------|------|-----------|-------------|
| POST | `/accept-invite` | — | — | Accept client portal invite (public) |
| GET | `/` | ✅ | clients:read | List clients (paginated, filterable) |
| POST | `/` | ✅ | clients:write | Create client |
| GET | `/:id` | ✅ | clients:read | Get client (Redis cached 5min) |
| PATCH | `/:id` | ✅ | clients:write | Update client |
| DELETE | `/:id` | ✅ | clients:write | Soft-delete (sets status=SUSPENDED) |
| POST | `/:id/invite` | ✅ | clients:write | Send portal invitation email |
| GET | `/:id/analytics` | ✅ | clients:read | Client analytics |

#### Invite Flow
```
POST /:id/invite
  → Find client by ID
  → Find or create User with role=CLIENT, clientId=client._id
  → generateSecureToken(32) → hashSHA256 → store in Redis (72h)
  → Send invitation email with /auth/accept-invite?token=...
  → Update client status to INVITED

POST /accept-invite (public)
  → hashSHA256(token) → lookup in Redis
  → Delete token (single-use)
  → If password provided: hash with argon2id, update user
  → Update client status to ONBOARDING
  → Auto-login: generate token pair
  → Set refreshToken cookie + return accessToken
```

#### Caching
- `getClient()` caches result in Redis for 5 minutes (`client:{id}`)
- Cache invalidated on `updateClient()` and `deleteClient()`

---

### 8.3 Projects Module

**Files:** `projects.routes.ts`, `projects.controller.ts`, `projects.service.ts`

#### Routes
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | projects:read | List projects (role-scoped) |
| POST | `/` | projects:write | Create project |
| GET | `/:id` | projects:read | Get project (access-controlled) |
| PATCH | `/:id` | projects:write | Update project |
| PATCH | `/:id/status` | projects:write | Update status |
| POST | `/:id/milestones` | projects:write | Add milestone |
| PATCH | `/:id/milestones/:mid` | projects:write | Update milestone |
| GET | `/:id/activity` | projects:read | Get audit log activity |

#### Role-Based Scoping
```
CLIENT       → filter by clientId (their own projects only)
PROJECT_MANAGER → filter by { pm: userId } OR { contributors: userId }
CONTRIBUTOR  → filter by { contributors: userId }
ADMIN/SUPERADMIN → no filter (see all)
```

#### Project Creation
```
POST /
  → generateSlug(name) — lowercase, hyphenated, 3-byte random suffix
  → Project.create({ ...data, slug, status: 'SCOPING' })
  → Channel.create({ name: 'general', type: 'PROJECT', ... }) — default channel
  → createNotification() → PM notified of new project
```

#### Health Score Computation
```
computeHealthScore(projectId):
  score = 100
  - 15 per overdue milestone (not COMPLETED, dueDate < now)
  - 5 per overdue task (not DONE, dueDate < now)
  - 20 if project endDate passed and not COMPLETED
  → clamp to [0, 100]
  → save to project.healthScore
```
Called by cron job every 6 hours for all ACTIVE projects.

#### Automation Events Emitted
- `project.status_changed` — when status field changes
- `milestone.completed` — when milestone status set to COMPLETED

---

### 8.4 Tasks Module

**Files:** `tasks.routes.ts`, `tasks.service.ts`

#### Routes
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | tasks:read | List tasks (filterable by project/assignee/status/priority/milestone) |
| POST | `/` | tasks:write | Create task |
| POST | `/reorder` | tasks:write | Bulk reorder (bulkWrite) |
| GET | `/:id` | tasks:read | Get task |
| PATCH | `/:id` | tasks:write | Update task |
| DELETE | `/:id` | tasks:write | Delete task |

#### Task Completion Tracking
```
updateTask(id, { status: 'DONE' }, actingUserId):
  → If transitioning TO DONE: set completedAt=now, completedBy=actingUserId
  → If transitioning FROM DONE: clear completedAt, completedBy
```

#### Notifications on Create
- Each assignee (except creator) receives a `TASK_ASSIGNED` notification
- `emitAutomationEvent('task.assigned', ...)` fired

#### Bulk Reorder
```
POST /reorder  { tasks: [{ id, order, status }] }
  → Task.bulkWrite() with updateOne per task
  → Updates both order and status in one DB round-trip
```

---

### 8.5 Files Module

**Files:** `files.routes.ts`, `files.service.ts`

#### Routes
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/upload` | files:write | Upload file (multipart) |
| GET | `/` | files:read | List files |
| GET | `/:id` | files:read | Get file metadata |
| GET | `/:id/download` | files:read | Redirect to signed URL (5min) |
| GET | `/:id/versions` | files:read | Get all versions |
| DELETE | `/:id` | files:write | Delete file |
| POST | `/:id/annotations` | files:write | Add annotation |
| PATCH | `/:id/annotations/:aid/resolve` | files:write | Resolve annotation |
| DELETE | `/:id/annotations/:aid` | files:write | Delete annotation |

#### Upload Flow
```
POST /upload (multipart/form-data)
  → Multer: memoryStorage, max size from env, block .exe/.bat/.cmd/.sh/.ps1/.vbs/.js/.jar
  → Check client storage quota (storageUsedBytes + fileSize ≤ storageLimitBytes)
  → If existingFileId: increment version number
  → generateStorageKey() → uploadFile() to S3/R2 (AES256 encrypted)
  → File.create() with scanStatus=PENDING
  → Client.storageUsedBytes += fileSize
  → Queue virus scan (Bull) or mark CLEAN immediately if Redis unavailable
  → Emit socket event: file:uploaded to project room
  → If isClientVisible: emitAutomationEvent('file.uploaded')
```

#### Access Control
- `CLIENT` role: can only see files where `isClientVisible=true` AND `clientId` matches
- `CONTRIBUTOR`: can only delete their own files
- Infected files (`scanStatus=INFECTED`) cannot be downloaded

#### Versioning
- `existingFileId` param triggers version increment
- `getFileVersions()` finds all files with same `originalName + folder + projectId`

---

### 8.6 Messages Module

**Files:** `messages.routes.ts`, `messages.service.ts`

#### Routes
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | messages:read | Get messages (by projectId or channelId) |
| POST | `/` | messages:write | Send message |
| GET | `/search` | messages:read | Full-text search |
| GET | `/channels` | messages:read | List channels |
| POST | `/channels` | messages:write | Create channel |
| GET | `/channels/:channelId/messages` | messages:read | Get channel messages |
| POST | `/channels/:channelId/messages` | messages:write | Send to channel |
| PATCH | `/:id` | messages:write | Edit message |
| DELETE | `/:id` | messages:write | Soft-delete message |
| POST | `/:id/pin` | messages:write | Pin/unpin message |
| POST | `/:id/read` | messages:read | Mark as read |

#### Message Send Flow
```
POST /
  → Message.create()
  → Channel.lastMessageAt = now
  → Populate sender, attachments, mentions
  → io.to('project:{projectId}').emit('message:new', populated)
  → For each @mention (not sender): createNotification(MENTION)
```

#### Soft Delete
```
DELETE /:id
  → Check: sender OR ADMIN/SUPERADMIN/PROJECT_MANAGER can delete
  → Message.update({ deletedAt: now, content: '[Message deleted]' })
  → io.emit('message:deleted', { id })
```

#### Full-Text Search
Uses MongoDB text index on `content` field. Returns results sorted by text score.

---

### 8.7 Invoices Module

**Files:** `invoices.routes.ts`, `invoices.service.ts`

#### Routes
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/webhooks/stripe` | — | Stripe webhook (raw body) |
| GET | `/` | invoices:read | List invoices |
| POST | `/` | invoices:write | Create invoice |
| GET | `/:id` | invoices:read | Get invoice |
| PATCH | `/:id` | invoices:write | Update invoice (DRAFT only) |
| POST | `/:id/send` | invoices:write | Send invoice to client |
| POST | `/:id/void` | invoices:write | Void invoice |
| POST | `/:id/payment-link` | invoices:read | Create Stripe checkout session |

#### Invoice Number Generation
```
INV-{YEAR}-{NNNN}
  → Count existing invoices matching INV-{year}-* pattern
  → Pad sequence to 4 digits
  → e.g. INV-2026-0001
```

#### Send Invoice Flow
```
POST /:id/send
  → Validate status=DRAFT
  → generateInvoicePDF() → uploadFile() to S3 (pdfKey stored)
  → Update status=SENT, issuedAt=now
  → sendEmail() to client with pay link
  → createNotification(INVOICE_DUE) for client user
```

#### Stripe Payment Flow
```
POST /:id/payment-link
  → Validate invoice is payable (SENT/VIEWED/PARTIAL/OVERDUE)
  → Find or create Stripe customer (stripeCustomerId on Client)
  → createCheckoutSession() with line items
  → Store checkoutSessionId on invoice
  → Return Stripe checkout URL

POST /webhooks/stripe (checkout.session.completed)
  → constructWebhookEvent() — verify Stripe signature
  → Find invoice by metadata.invoiceId
  → Update status=PAID, paidAt, paymentGateway=STRIPE, paymentIntentId
  → emitAutomationEvent('invoice.paid')
  → createNotification(INVOICE_PAID) for project PM
```

#### Overdue Marking
- Cron job runs hourly: `Invoice.updateMany({ status: {$in: ['SENT','VIEWED','PARTIAL']}, dueDate: {$lt: now} }, { status: 'OVERDUE' })`
- Also available as `markOverdueInvoices()` service function

---

### 8.8 Contracts Module

**Files:** `contracts.routes.ts`, `contracts.service.ts`

#### Routes
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | contracts:read | List contracts |
| POST | `/` | contracts:write | Create contract |
| GET | `/templates` | contracts:read | List templates |
| POST | `/templates` | contracts:write | Create template |
| GET | `/:id` | contracts:read | Get contract |
| PATCH | `/:id` | contracts:write | Update contract (DRAFT only) |
| POST | `/:id/send` | contracts:write | Send to client |
| POST | `/:id/sign` | contracts:read | Sign contract |

#### Template Variable Injection
```
content = "This agreement between {{clientName}} and {{agencyName}}..."
injectVariables(content, { clientName: 'Acme Corp', agencyName: 'My Agency' })
→ "This agreement between Acme Corp and My Agency..."
```
Uses `{{variableName}}` syntax with regex replacement.

#### Signing Flow
```
POST /:id/sign { svg, signerName, isAgency?, ipAddress, userAgent }
  → hashContractSignature(content, svg, timestamp) → SHA-256 hash
  → Store signature in clientSignature or agencySignature
  → If both parties signed: status = EXECUTED, else status = SIGNED
  → generateContractPDF() with both signatures → upload to S3
  → emitAutomationEvent('contract.signed')
```

---

### 8.9 Approvals Module

**Files:** `approvals.routes.ts`, `approvals.service.ts`

#### Routes
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | approvals:read | List approvals |
| POST | `/` | approvals:write | Submit for approval |
| GET | `/:id` | approvals:read | Get approval |
| POST | `/:id/approve` | approvals:write | Approve deliverable |
| POST | `/:id/reject` | approvals:write | Reject with reason |
| POST | `/:id/review` | approvals:write | Unified: approve/reject/request_revision |
| POST | `/:id/request-revision` | approvals:write | Request revision with note |

#### Approval Workflow States
```
PENDING → IN_REVIEW → APPROVED
                    → REJECTED
                    → REVISION_REQUESTED → (resubmit) → PENDING
```

#### On Create
- Finds client user for the project
- Sends `APPROVAL_NEEDED` notification + email to client
- Emits `approval:updated` socket event to project room

#### On Approve/Reject
- Sends `APPROVAL_UPDATED` notification to project PM
- Emits `approval:updated` socket event

---

### 8.10 Notifications Module

**Files:** `notifications.routes.ts`, `notifications.service.ts`

#### Routes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List notifications (paginated, filterable by unread) |
| POST | `/read-all` | Mark all as read |
| GET | `/preferences` | Get notification preferences |
| PATCH | `/preferences` | Update preferences |
| POST | `/:id/read` | Mark single notification as read |

#### createNotification()
Called internally by all modules. After DB insert, emits `notification:new` to `user:{userId}` Socket.io room.

#### Notification Types
`TASK_ASSIGNED`, `FILE_UPLOADED`, `INVOICE_DUE`, `INVOICE_PAID`, `MESSAGE_RECEIVED`, `APPROVAL_NEEDED`, `APPROVAL_UPDATED`, `CONTRACT_SIGNED`, `CONTRACT_SENT`, `PROJECT_STATUS_CHANGED`, `MILESTONE_COMPLETED`, `MENTION`, `SYSTEM`

---

### 8.11 Automations Module

**Files:** `automations.routes.ts`, `automations.service.ts`

#### Routes
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/` | automations:read | List rules |
| POST | `/` | automations:write | Create rule |
| GET | `/:id` | automations:read | Get rule |
| PATCH | `/:id` | automations:write | Update rule |
| DELETE | `/:id` | automations:write | Delete rule |

#### Rule Engine
```
emitAutomationEvent(event, context):
  → Find all active rules matching trigger.event
  → For each rule:
      → evaluateConditions(conditions, context)
          → operators: eq, neq, gt, lt, contains, not_contains
          → supports nested field paths (e.g. 'project.status')
      → If conditions pass: executeActions(actions, context)
      → Increment runCount, update lastRunAt
      → On error: increment errorCount, log error (non-fatal)
```

#### Action Types
| Type | What it does |
|------|-------------|
| `SEND_NOTIFICATION` | Creates in-app notification via notifications service |
| `SEND_EMAIL` | Sends email via email lib |
| `CALL_WEBHOOK` | HTTP POST to external URL (10s timeout) |
| `CREATE_TASK` | Creates a task in specified project |
| `CHANGE_STATUS` | (defined in model, not yet implemented in executor) |
| `SEND_INVOICE` | (defined in model, not yet implemented in executor) |

#### Trigger Events
`project.status_changed`, `invoice.overdue`, `invoice.paid`, `milestone.completed`, `file.uploaded`, `approval.given`, `approval.rejected`, `contract.signed`, `task.assigned`, `client.activated`

---

### 8.12 Analytics Module

**Files:** `analytics.routes.ts`, `analytics.service.ts`

#### Routes
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/agency` | analytics:read | Agency-wide dashboard |
| GET | `/projects/:id` | analytics:read | Project analytics |
| GET | `/clients/:id` | analytics:read | Client analytics |

All results cached in Redis for 5 minutes (agency) or 2 minutes (project/client).

#### Agency Analytics
Parallel queries for: total/active clients, total/active/completed projects, total/paid/overdue invoices, revenue (current 30d, previous 30d, growth %), outstanding revenue, revenue trend (6 months), team member count.

#### Project Analytics
Tasks by status, milestone completion rate, approval stats (total/approved/pending/revisions), invoice totals (total/paid/outstanding), project health score.

#### Client Analytics
Projects by status, invoice history, total/outstanding revenue, storage usage.

---

### 8.13 Admin Module

**File:** `admin.routes.ts`

All routes require `authenticate` + `authorizeRoles('ADMIN', 'SUPERADMIN')`.

#### Routes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/team` | List all internal team members |
| POST | `/team/invite` | Invite team member (sends temp password email) |
| PATCH | `/team/:id/role` | Change user role |
| PATCH | `/team/:id/deactivate` | Deactivate user |
| PATCH | `/team/:id/activate` | Activate user |
| PATCH | `/team/:id/promote-superadmin` | Promote to SUPERADMIN (SUPERADMIN only) |
| GET | `/audit-logs` | Paginated audit log (filterable by userId/resource) |
| GET | `/db-health` | MongoDB connection status + user count |

#### Team Invite Flow
```
POST /team/invite { email, name, role }
  → Check email uniqueness
  → Generate random 12-char temp password
  → argon2.hash(tempPassword)
  → User.create({ email, name, role, passwordHash })
  → sendEmail() with getTeamInviteEmail() template (includes temp password)
```

---

---

## 9. Library Layer

### `lib/jwt.ts`
- `signAccessToken({ sub, role, clientId, sessionId })` → JWT, 15m expiry
- `signRefreshToken({ sub, sessionId, family })` → JWT, 7d expiry
- `verifyAccessToken(token)` → `AccessTokenPayload` or throws `AuthenticationError`
- `verifyRefreshToken(token)` → `RefreshTokenPayload` or throws `AuthenticationError`
- Separate secrets for access and refresh tokens (prevents cross-use)
- Token type field (`type: 'access'|'refresh'`) prevents token type confusion attacks

### `lib/crypto.ts`
| Function | Description |
|----------|-------------|
| `encrypt(text)` | AES-256-GCM, returns `iv:tag:ciphertext` hex string |
| `decrypt(encrypted)` | Reverses encrypt() |
| `hashSHA256(data)` | SHA-256 hex digest |
| `generateSecureToken(length)` | Cryptographically random hex token |
| `generateOTP(length)` | Numeric OTP using crypto.randomBytes |
| `hashContractSignature(content, sig, ts)` | SHA-256 of concatenated fields |
| `generateSlug(name)` | Lowercase, hyphenated + 3-byte random suffix |
| `timingSafeEqual(a, b)` | Constant-time string comparison |

**Note:** `getEncryptionKey()` pads/truncates `ENCRYPTION_KEY` to exactly 32 bytes. If key is not set, falls back to a hardcoded default — **this is a security risk in production** (see Section 16).

### `lib/email.ts`
Transport selection:
1. `NODE_ENV=test` → jsonTransport (no actual sending)
2. `SMTP_HOST` set → SMTP (Gmail-aware: forces From = SMTP_USER)
3. Fallback → streamTransport (logs to console in dev)

Email templates (all return HTML strings):
- `getMagicLinkEmail(name, link)` — sign-in link
- `getTeamInviteEmail(name, email, role, agency, loginUrl, tempPassword)` — team invite with credentials
- `getClientInviteEmail(name, agency, inviteLink, agencyEmail)` — client portal invite
- `getInvoiceEmail(clientName, invoiceNumber, amount, dueDate, payLink)` — invoice with pay button
- `getApprovalRequestEmail(clientName, projectName, deliverableName, link)` — approval needed
- `getContractEmail(clientName, contractTitle, agencyName, link)` — contract ready to sign
- `getPasswordResetEmail(name, link)` — password reset (1h expiry)
- `getInvitationEmail` — alias for `getClientInviteEmail` (backward compat)

### `lib/pdf.ts`
Uses `pdf-lib` (pure JS, no headless browser needed).

**`generateInvoicePDF(data)`** — A4 page (595×842pt):
- Blue header with agency name + invoice number
- Bill To + Invoice Details sections
- Line items table with description/qty/unit price/amount
- Totals section (subtotal, discount, tax, total)
- Status-colored badge (green=PAID, red=OVERDUE, blue=SENT)
- Notes section + footer

**`generateContractPDF(title, content, signatures)`**:
- Strips HTML tags from content
- Renders plain text with word-wrapping
- Signature blocks at bottom with name + date

### `lib/stripe.ts`
- Lazy singleton Stripe client
- `createStripeCustomer(email, name)` → customer ID
- `createPaymentIntent(amount, currency, customerId)` → PaymentIntent (amount in cents)
- `createCheckoutSession(customerId, lineItems, successUrl, cancelUrl, metadata)` → Session
- `constructWebhookEvent(payload, signature)` → verified Stripe.Event
- `createRefund(paymentIntentId, amount?)` → Refund

### `lib/passport.ts`
Google OAuth 2.0 strategy:
1. Find user by `googleId`
2. If not found, find by `email`
3. If found: link `googleId` if missing, update `lastLoginAt`
4. If not found: create new user with role=CLIENT, avatar from Google profile
5. Minimal serialize/deserialize (stateless JWT flow)

### `lib/logger.ts`
Pino logger with:
- Level: `debug` in dev, `info` in production
- Pretty-print in dev (pino-pretty)
- Redacts: `authorization`, `cookie`, `password`, `passwordHash`, `token`, `secret`

### `lib/frontendUrl.ts`
Priority: `Origin header` → `Referer header` → `env.FRONTEND_URL`
Whitelists: `localhost:3000`, `localhost:5173`, `127.0.0.1:3000/5173`, `env.FRONTEND_URL`
Strips trailing slashes.

---

## 10. Workers & Background Jobs

### Bull Queues (Redis-backed, lazy-initialized)

All queues follow the same pattern:
- Only created when `isRedisAvailable()` returns true
- Lazy initialization on first call
- Default job options: 3 attempts, exponential backoff (2-5s base)
- `removeOnComplete: 50-100`, `removeOnFail: 50`

#### `emailWorker.ts` — `email` queue
- Processes: `{ to, subject, html, text, attachments }`
- Fallback: if Redis unavailable, sends email synchronously

#### `invoiceWorker.ts` — `invoice` queue
- Job name: `generate-pdf`
- Processes: `{ invoiceId }`
- Fetches invoice + client, generates PDF, uploads to S3, stores `pdfKey`

#### `scanWorker.ts` — `file-scan` queue
- Processes: `{ fileId, storageKey }`
- If `VIRUS_SCAN_ENABLED=false`: immediately marks file as CLEAN
- If enabled: ClamAV integration (currently marks CLEAN — full ClamAV integration is a stub)
- Fallback: if Redis unavailable, marks file CLEAN immediately

### Scheduled Jobs (`scheduledJobs.ts`)

| Schedule | Job | Description |
|----------|-----|-------------|
| `0 * * * *` | Overdue invoices | Every hour: mark SENT/VIEWED/PARTIAL invoices past dueDate as OVERDUE |
| `0 9 * * *` | Invoice reminders | Daily 9am: send reminder emails for invoices due in 3 days |
| `0 */6 * * *` | Health scores | Every 6 hours: recompute health score for all ACTIVE projects |

---

## 11. Real-time Layer (Socket.io)

### Authentication
JWT token required in `socket.handshake.auth.token` or `Authorization` header. Verified with `verifyAccessToken()`. Payload stored in `socket.data`.

### Rooms
| Room | Who joins | Events received |
|------|-----------|----------------|
| `user:{userId}` | Auto on connect | `notification:new` |
| `project:{projectId}` | On `join:project` event | `message:new`, `message:edited`, `message:deleted`, `file:uploaded`, `approval:updated`, `typing:start`, `typing:stop` |

### Client → Server Events
| Event | Payload | Description |
|-------|---------|-------------|
| `join:project` | `projectId: string` | Join project room |
| `leave:project` | `projectId: string` | Leave project room |
| `typing:start` | `{ projectId, channelId }` | Broadcast typing indicator |
| `typing:stop` | `{ projectId, channelId }` | Stop typing indicator |
| `presence:update` | `'online'|'away'|'offline'` | Broadcast presence status |

### Server → Client Events
| Event | Payload | Emitted by |
|-------|---------|-----------|
| `notification:new` | Notification object | notifications.service |
| `message:new` | Populated message | messages.service |
| `message:edited` | Updated message | messages.service |
| `message:deleted` | `{ id }` | messages.service |
| `file:uploaded` | `{ fileId, name, uploadedBy, projectId }` | files.service |
| `approval:updated` | `{ approvalId, status }` | approvals.service |
| `typing:start` | `{ userId, channelId }` | socketServer |
| `typing:stop` | `{ userId, channelId }` | socketServer |
| `presence:update` | `{ userId, status }` | socketServer |

### Configuration
- CORS: `env.FRONTEND_URL` only
- Transports: websocket + polling (fallback)
- Ping timeout: 60s, Ping interval: 25s

---

## 12. API Route Reference

Base URL: `http://localhost:5000/api/v1`

### Auth — `/api/v1/auth`
```
POST   /register                  Register new user
POST   /login                     Email + password login
POST   /refresh                   Refresh access token
POST   /logout                    Logout (revoke session)
POST   /magic-link                Send magic link email
POST   /magic-link/verify         Verify magic link token
POST   /forgot-password           Send password reset email
POST   /reset-password            Reset password with token
GET    /me                        Get current user profile
PATCH  /me                        Update profile
PATCH  /me/password               Change password
GET    /devices                   List trusted devices
DELETE /devices/:deviceId         Revoke device
GET    /google                    Start Google OAuth
GET    /google/callback           Google OAuth callback
POST   /bootstrap-superadmin      One-time SUPERADMIN setup
POST   /dev-set-password          Dev-only password recovery
```

### Clients — `/api/v1/clients`
```
POST   /accept-invite             Accept portal invite (public)
GET    /                          List clients
POST   /                          Create client
GET    /:id                       Get client
PATCH  /:id                       Update client
DELETE /:id                       Soft-delete client
POST   /:id/invite                Send portal invitation
GET    /:id/analytics             Client analytics
```

### Projects — `/api/v1/projects`
```
GET    /                          List projects (role-scoped)
POST   /                          Create project
GET    /:id                       Get project
PATCH  /:id                       Update project
PATCH  /:id/status                Update project status
POST   /:id/milestones            Add milestone
PATCH  /:id/milestones/:mid       Update milestone
GET    /:id/activity              Get audit log activity
```

### Tasks — `/api/v1/tasks`
```
GET    /                          List tasks
POST   /                          Create task
POST   /reorder                   Bulk reorder tasks
GET    /:id                       Get task
PATCH  /:id                       Update task
DELETE /:id                       Delete task
```

### Files — `/api/v1/files`
```
POST   /upload                    Upload file (multipart)
GET    /                          List files
GET    /:id                       Get file metadata
GET    /:id/download              Download (signed URL redirect)
GET    /:id/versions              Get file versions
DELETE /:id                       Delete file
POST   /:id/annotations           Add annotation
PATCH  /:id/annotations/:aid/resolve  Resolve annotation
DELETE /:id/annotations/:aid      Delete annotation
```

### Messages — `/api/v1/messages`
```
GET    /                          Get messages
POST   /                          Send message
GET    /search                    Full-text search
GET    /channels                  List channels
POST   /channels                  Create channel
GET    /channels/:channelId/messages   Get channel messages
POST   /channels/:channelId/messages   Send to channel
PATCH  /:id                       Edit message
DELETE /:id                       Delete message
POST   /:id/pin                   Pin/unpin message
POST   /:id/read                  Mark as read
```

### Invoices — `/api/v1/invoices`
```
POST   /webhooks/stripe           Stripe webhook (no auth)
GET    /                          List invoices
POST   /                          Create invoice
GET    /:id                       Get invoice
PATCH  /:id                       Update invoice
POST   /:id/send                  Send invoice to client
POST   /:id/void                  Void invoice
POST   /:id/payment-link          Create Stripe checkout session
```

### Contracts — `/api/v1/contracts`
```
GET    /                          List contracts
POST   /                          Create contract
GET    /templates                 List templates
POST   /templates                 Create template
GET    /:id                       Get contract
PATCH  /:id                       Update contract
POST   /:id/send                  Send to client
POST   /:id/sign                  Sign contract
```

### Approvals — `/api/v1/approvals`
```
GET    /                          List approvals
POST   /                          Submit for approval
GET    /:id                       Get approval
POST   /:id/approve               Approve
POST   /:id/reject                Reject with reason
POST   /:id/review                Unified review (approve/reject/request_revision)
POST   /:id/request-revision      Request revision
```

### Notifications — `/api/v1/notifications`
```
GET    /                          List notifications
POST   /read-all                  Mark all as read
GET    /preferences               Get preferences
PATCH  /preferences               Update preferences
POST   /:id/read                  Mark single as read
```

### Automations — `/api/v1/automations`
```
GET    /                          List automation rules
POST   /                          Create rule
GET    /:id                       Get rule
PATCH  /:id                       Update rule
DELETE /:id                       Delete rule
```

### Analytics — `/api/v1/analytics`
```
GET    /agency                    Agency dashboard
GET    /projects/:id              Project analytics
GET    /clients/:id               Client analytics
```

### Admin — `/api/v1/admin`
```
GET    /team                      List team members
POST   /team/invite               Invite team member
PATCH  /team/:id/role             Change role
PATCH  /team/:id/deactivate       Deactivate user
PATCH  /team/:id/activate         Activate user
PATCH  /team/:id/promote-superadmin  Promote to SUPERADMIN
GET    /audit-logs                Paginated audit logs
GET    /db-health                 MongoDB health check
```

### System
```
GET    /health                    Health check (no auth)
```

---

## 13. Role-Based Access Control

### Roles (hierarchy)
```
SUPERADMIN > ADMIN > PROJECT_MANAGER > CONTRIBUTOR > CLIENT
```

### Permission Matrix

| Permission | SUPERADMIN | ADMIN | PROJECT_MANAGER | CONTRIBUTOR | CLIENT |
|-----------|-----------|-------|----------------|-------------|--------|
| clients:read | ✅ | ✅ | ✅ | — | — |
| clients:write | ✅ | ✅ | — | — | — |
| projects:read | ✅ | ✅ | ✅ | ✅ | ✅ |
| projects:write | ✅ | ✅ | ✅ | — | — |
| tasks:read | ✅ | ✅ | ✅ | ✅ | ✅ |
| tasks:write | ✅ | ✅ | ✅ | ✅ | — |
| files:read | ✅ | ✅ | ✅ | ✅ | ✅ |
| files:write | ✅ | ✅ | ✅ | ✅ | — |
| messages:read | ✅ | ✅ | ✅ | ✅ | ✅ |
| messages:write | ✅ | ✅ | ✅ | ✅ | ✅ |
| invoices:read | ✅ | ✅ | ✅ | — | ✅ |
| invoices:write | ✅ | ✅ | — | — | — |
| contracts:read | ✅ | ✅ | ✅ | — | ✅ |
| contracts:write | ✅ | ✅ | — | — | — |
| team:read | ✅ | ✅ | — | — | — |
| team:write | ✅ | ✅ | — | — | — |
| analytics:read | ✅ | ✅ | ✅ | — | — |
| analytics:write | ✅ | — | — | — | — |
| automations:read | ✅ | ✅ | — | — | — |
| automations:write | ✅ | ✅ | — | — | — |
| admin:read | ✅ | ✅ | — | — | — |
| admin:write | ✅ | ✅ | — | — | — |
| approvals:read | ✅ | ✅ | ✅ | ✅ | ✅ |
| approvals:write | ✅ | ✅ | ✅ | — | ✅ |

### Additional Row-Level Access Controls
- **Projects**: CLIENTs scoped to their `clientId`; CONTRIBUTORs scoped to projects they're listed in
- **Files**: CLIENTs can only see `isClientVisible=true` files for their `clientId`
- **Invoices**: CLIENTs see only their own invoices (forced `clientId` filter)
- **Contracts**: CLIENTs see only their own contracts (forced `clientId` filter)
- **Messages**: CONTRIBUTORs/CLIENTs can only delete their own messages
- **Files**: CONTRIBUTORs can only delete their own files

---

## 14. Error Handling

### Error Class Hierarchy
```
Error
└── AppError (statusCode, isOperational, code, details)
    ├── ValidationError      → 400 BAD_REQUEST
    ├── AuthenticationError  → 401 UNAUTHORIZED
    ├── AuthorizationError   → 403 FORBIDDEN
    ├── NotFoundError        → 404 NOT_FOUND
    ├── ConflictError        → 409 CONFLICT
    ├── RateLimitError       → 429 TOO_MANY_REQUESTS
    ├── PaymentError         → 402 PAYMENT_REQUIRED
    └── FileError            → 422 UNPROCESSABLE_ENTITY
```

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": { "email": ["Invalid email"] }
  },
  "requestId": "uuid-here"
}
```

### Global Error Handler Handles
1. `ZodError` → 400 with field-level errors
2. `mongoose.Error.ValidationError` → 400 with field details
3. MongoDB duplicate key (11000) → 409 with field name
4. `mongoose.Error.CastError` (bad ObjectId) → 400
5. `AppError` (operational) → mapped status code
6. Unknown errors → 500 (message hidden in production)

---

## 15. Security Audit

### Strengths ✅

| Area | Implementation |
|------|---------------|
| Password hashing | argon2id with high cost parameters (64MB memory, 3 iterations) |
| JWT security | Separate secrets for access/refresh; type field prevents token confusion |
| Token rotation | Single-use refresh tokens; reuse detection revokes entire family |
| Session revocation | Redis-backed revocation list for logout |
| Rate limiting | 4 tiers: general (200/min), auth (10/min), upload (20/min), strict (5/min) |
| Input validation | Zod schemas on all write endpoints |
| NoSQL injection | express-mongo-sanitize on all requests |
| Security headers | Helmet with CSP, HSTS, X-Frame-Options, etc. |
| CORS | Strict whitelist (not wildcard) |
| File upload | Blocked dangerous extensions (.exe, .bat, .sh, .ps1, .js, .jar, etc.) |
| Storage | Server-side AES256 encryption on all S3/R2 uploads |
| Signed URLs | Download URLs expire in 5 minutes |
| Audit logging | All admin actions logged with IP, user-agent, before/after state |
| Secret redaction | Pino logger redacts passwords, tokens, secrets from logs |
| Google OAuth | State param prevents CSRF; origin whitelist prevents open-redirect |
| Magic links | Single-use, 72h expiry, SHA-256 hashed in Redis |
| Contract signatures | SHA-256 hash of content+signature+timestamp for tamper detection |
| Timing-safe comparison | `timingSafeEqual()` for token comparison |
| Cookie security | httpOnly, secure (production), sameSite=lax |

### Weaknesses / Risks ⚠️

| # | Issue | Severity | Location |
|---|-------|----------|---------|
| 1 | **Hardcoded encryption key fallback** — if `ENCRYPTION_KEY` is not set, falls back to `'default-encryption-key-32-chars!!'` | HIGH | `lib/crypto.ts:getEncryptionKey()` |
| 2 | **Virus scan is a stub** — `scanWorker.ts` marks all files CLEAN regardless of `VIRUS_SCAN_ENABLED` | MEDIUM | `workers/scanWorker.ts` |
| 3 | **No CSRF protection** — relies on sameSite=lax cookies; no CSRF token for state-changing requests | MEDIUM | `app.ts` |
| 4 | **Webhook endpoint not rate-limited** — Stripe webhook at `/webhooks/stripe` bypasses general limiter | LOW | `app.ts`, `invoices.routes.ts` |
| 5 | **`CHANGE_STATUS` and `SEND_INVOICE` automation actions not implemented** — defined in model but not in executor | LOW | `automations.service.ts` |
| 6 | **No pagination on `getFileVersions()`** — could return unbounded results | LOW | `files.service.ts` |
| 7 | **`dev-set-password` duplicated** — exists in both `app.ts` and `auth.routes.ts` | LOW | Both files |
| 8 | **Analytics cache not invalidated** — stale data for up to 5 minutes after changes | INFO | `analytics.service.ts` |
| 9 | **No request body size limit on Stripe webhook** — uses `express.raw()` without explicit limit | INFO | `app.ts` |
| 10 | **`hpp` package listed in dependencies but not used** in `app.ts` | INFO | `package.json` |

---

## 16. Findings & Recommendations

### Critical / High Priority

**1. Set ENCRYPTION_KEY in production**
The fallback key in `crypto.ts` means any data encrypted without a proper key is trivially decryptable. Add `ENCRYPTION_KEY` to your production environment and rotate any data encrypted with the default.

**2. Implement virus scanning**
The `scanWorker.ts` is a stub. Either integrate ClamAV properly or use a cloud scanning service (e.g., AWS Malware Protection for S3). Currently all files are marked CLEAN regardless.

### Medium Priority

**3. Add CSRF protection**
For cookie-based auth flows, add a CSRF token (e.g., `csurf` or double-submit cookie pattern) for state-changing endpoints.

**4. Implement missing automation actions**
`CHANGE_STATUS` and `SEND_INVOICE` are defined in the model but not handled in `executeActions()`. Add a `default` case warning or implement them.

**5. Add pagination to `getFileVersions()`**
Large version histories could cause memory issues. Add `limit` parameter.

### Low Priority / Improvements

**6. Remove duplicate `dev-set-password` route**
It exists in both `app.ts` and `auth.routes.ts`. Remove one to avoid confusion.

**7. Add Redis adapter for Socket.io**
The `@socket.io/redis-adapter` package is installed but not used. Without it, Socket.io events won't work correctly in a multi-instance deployment.

**8. Add `hpp` middleware or remove the dependency**
HTTP Parameter Pollution protection (`hpp`) is installed but not applied in `app.ts`.

**9. Add request body size limit to Stripe webhook**
```typescript
app.use('/api/v1/invoices/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }));
```

**10. Consider analytics cache invalidation**
When a project/invoice/client changes, invalidate the relevant analytics cache keys to avoid serving stale data.

**11. Add `SEND_INVOICE` and `CHANGE_STATUS` automation actions**
These are defined in the `AutomationRule` model but not implemented in the automation executor.

**12. Add integration tests for the Stripe webhook flow**
The payment flow is critical but has no test coverage visible in the codebase.

---

## Appendix: Data Flow Diagrams

### Request Lifecycle
```
Client Request
    │
    ├─ Helmet (security headers)
    ├─ CORS check
    ├─ Raw body (Stripe webhook only)
    ├─ JSON/URL body parsing
    ├─ Cookie parsing
    ├─ Compression
    ├─ MongoDB sanitize
    ├─ Passport initialize
    ├─ Request ID injection
    ├─ Rate limiting
    │
    ├─ Route handler
    │   ├─ authenticate() → JWT verify → Redis session check → user cache
    │   ├─ authorize() → RBAC permission check
    │   ├─ validateBody() → Zod schema validation
    │   └─ Service function → MongoDB → Redis cache → S3/R2 → Socket.io
    │
    └─ Error handler (if any error thrown)
```

### Invoice Payment Flow
```
Agency creates invoice (DRAFT)
    → Agency sends invoice (SENT) → PDF generated → Email sent to client
    → Client views invoice (VIEWED)
    → Client requests payment link → Stripe checkout session created
    → Client pays on Stripe → Stripe webhook fires
    → Invoice marked PAID → PM notified → automation event fired
```

### Client Onboarding Flow
```
Admin creates Client record
    → Admin sends invite → User created (role=CLIENT) → Invite token stored in Redis
    → Client receives email → Clicks link → Sets password
    → Client status: INVITED → ONBOARDING
    → Client logs in → Sees their projects, invoices, contracts
    → Admin activates client → Status: ACTIVE
```

### Approval Workflow
```
PM uploads files → Submits approval request (PENDING)
    → Client notified (email + in-app + socket)
    → Client reviews → Approves (APPROVED) or Rejects (REJECTED)
                     → Requests revision (REVISION_REQUESTED)
    → PM notified of decision
    → If revision: PM uploads new files → Resubmits
```

---

*Documentation generated by full codebase audit — AgencyOS Backend v1.0.0*
