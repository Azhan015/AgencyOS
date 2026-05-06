# Agency OS — Complete Project Documentation

## Table of Contents

1. [What is Agency OS?](#1-what-is-agency-os)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Authentication System](#3-authentication-system)
   - Magic Link
   - Password Login
   - Google OAuth
4. [Module-by-Module Breakdown](#4-module-by-module-breakdown)
5. [User Workflows by Role](#5-user-workflows-by-role)
6. [Technical Architecture](#6-technical-architecture)
7. [Environment Variables Reference](#7-environment-variables-reference)
8. [MongoDB & Server Health](#8-mongodb--server-health)
9. [Promoting a User to SUPERADMIN](#9-promoting-a-user-to-superadmin)

---

## 1. What is Agency OS?

Agency OS is a **full-stack client management platform** built for digital agencies. It replaces the patchwork of tools (Notion, Slack, FreshBooks, DocuSign, Dropbox) with a single unified system.

**Core value proposition:**
- Agencies manage projects, tasks, files, invoices, contracts, and approvals in one place
- Clients get a branded portal to view their project status, approve deliverables, pay invoices, and communicate
- Everything is real-time — messages, notifications, and status updates happen instantly

**Tech stack:**
- Backend: Node.js + Express + TypeScript + MongoDB (Mongoose) + Redis + Socket.io
- Frontend: React + TypeScript + Vite + Tailwind CSS + Zustand + TanStack Query

---

## 2. User Roles & Permissions

There are 5 roles in the system, ordered from most to least privileged:

### SUPERADMIN
The highest-privilege role. Typically the agency owner or technical lead.
- Full access to everything
- Can promote other users to SUPERADMIN (via `PATCH /api/v1/admin/team/:id/promote-superadmin`)
- Cannot be deactivated or have their role changed by anyone except another SUPERADMIN
- Sees all clients, projects, invoices, contracts, analytics, automations

### ADMIN
Agency staff with full operational access.
- Can create/manage clients, projects, invoices, contracts, approvals
- Can invite and manage team members (but cannot promote to SUPERADMIN)
- Can view analytics
- Cannot change automation rules (SUPERADMIN only for that)

### PROJECT_MANAGER
Agency staff focused on project delivery.
- Can create and manage projects, tasks, milestones
- Can upload files, send messages, manage approvals
- Can view (but not create) invoices
- Cannot manage clients or team members

### CONTRIBUTOR
Agency staff (designers, developers, copywriters).
- Can view projects they are assigned to
- Can upload files and send messages
- Can view approvals (but not approve/reject)
- No access to invoices, contracts, or admin areas

### CLIENT
The end client — the person or company paying for the work.
- Can only see their own projects, files, messages, invoices, contracts, approvals
- Can approve or reject deliverables
- Can sign contracts digitally
- Can pay invoices via Stripe
- Cannot see other clients' data

---

## 3. Authentication System

### 3.1 Password Login

Standard email + password authentication.

**Flow:**
1. User visits `/auth/login`, enters email and password
2. Frontend POSTs to `POST /api/v1/auth/login`
3. Backend verifies password with Argon2id (memory-hard hashing)
4. Returns `accessToken` (15-minute JWT) in response body + `refreshToken` as httpOnly cookie
5. Frontend stores `accessToken` in Zustand store (persisted to localStorage)
6. All API requests include `Authorization: Bearer <accessToken>` header
7. When access token expires, the Axios interceptor automatically calls `POST /api/v1/auth/refresh` using the httpOnly cookie to get a new access token

**Security features:**
- Argon2id password hashing (65536 KB memory, 3 iterations, 4 parallelism)
- Refresh token rotation — each refresh issues a new refresh token and invalidates the old one
- Token reuse detection — if an old refresh token is used, the entire session family is revoked
- Session revocation stored in Redis (15-minute TTL matching access token lifetime)
- Device tracking — up to 5 devices per user, oldest removed when limit reached

### 3.2 Magic Link

Passwordless authentication via email. Ideal for clients who don't want to remember passwords.

**How it works:**
1. User clicks "Sign in with magic link" on the login page
2. Enters their email address
3. Frontend POSTs to `POST /api/v1/auth/magic-link`
4. Backend generates a cryptographically secure 32-byte random token
5. Hashes the token with SHA-256 and stores `hash → userId` in Redis with 72-hour TTL
6. Sends an email via SMTP (Gmail) with a link: `http://localhost:5173/auth/magic?token=<raw_token>`
7. User clicks the link in their email
8. Browser opens the login page with `?token=` in the URL
9. Frontend auto-calls `POST /api/v1/auth/magic-link/verify` with the token
10. Backend hashes the token, looks up the userId in Redis, deletes the key (single-use), issues JWT tokens
11. User is logged in

**Email configuration (Gmail App Password):**
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`
- `SMTP_USER` = your Gmail address (e.g. `yourname@gmail.com`)
- `SMTP_PASS` = a 16-character **App Password** generated from Google Account → Security → 2-Step Verification → App Passwords
- An App Password is NOT your regular Gmail password. It's a special password Google generates for apps that don't support OAuth2 sign-in. You need 2FA enabled on your Google account to generate one.
- The app password in the current `.env` (`yzutgcspssoxpbgg`) is already set — you just need to update `SMTP_USER` to the Gmail account that generated it.

**What happens if Redis is down?**
- Magic links still work because the token is stored in Redis. If Redis is unavailable, magic links will fail (the token can't be stored or retrieved). The app falls back gracefully for most features but magic links require Redis.

### 3.3 Google OAuth

Sign in with Google — users click a button and are redirected to Google's consent screen.

**How it works:**
1. User clicks "Sign in with Google" on the login page
2. Browser navigates to `GET /api/v1/auth/google`
3. Passport.js redirects to Google's OAuth consent screen
4. User approves access
5. Google redirects to `GET /api/v1/auth/google/callback` with an authorization code
6. Passport exchanges the code for a Google profile (name, email, avatar)
7. Backend finds or creates a User document:
   - If a user with that `googleId` exists → log them in
   - If a user with that email exists → link the Google account and log them in
   - Otherwise → create a new user with role `CLIENT`
8. Issues JWT tokens, sets refresh token cookie
9. Redirects browser to `http://localhost:5173/auth/google/callback#token=<accessToken>`
10. The `GoogleCallbackPage` React component reads the token from the URL hash, fetches the user profile, and stores everything in the auth store

**Required setup in Google Cloud Console:**
1. Go to https://console.cloud.google.com
2. Create a project (or use existing)
3. Enable "Google+ API" or "People API"
4. Go to Credentials → Create OAuth 2.0 Client ID
5. Application type: Web application
6. Authorized redirect URIs: `http://localhost:5000/api/v1/auth/google/callback`
7. Copy Client ID → `GOOGLE_CLIENT_ID` in `.env`
8. Copy Client Secret → `GOOGLE_CLIENT_SECRET` in `.env`

The credentials in the current `.env` are already configured. Google OAuth is fully implemented and ready to use.

---

## 4. Module-by-Module Breakdown

### 4.1 Projects

**What it is:** The central hub of the platform. Every piece of work is organized into a project.

**Key features:**
- Project types: Website, Branding, Campaign, Custom
- Status lifecycle: SCOPING → ACTIVE → REVIEW → COMPLETED → ARCHIVED
- Health score (0–100%) calculated from task completion, milestone progress, and overdue items
- Milestones with optional invoice triggers (completing a milestone auto-creates an invoice)
- Budget tracking in any currency
- Team assignment (PM + contributors)
- Tags for categorization

**Who uses it:**
- ADMIN/SUPERADMIN: Create projects, assign PMs, set budgets
- PROJECT_MANAGER: Manage day-to-day, update status, add milestones
- CONTRIBUTOR: View assigned projects, update task status
- CLIENT: View their project(s), see progress, access files/messages/approvals/invoices

### 4.2 Tasks (Kanban Board)

**What it is:** A Kanban-style task board within each project.

**Key features:**
- Columns: TODO, IN_PROGRESS, REVIEW, DONE
- Task priority: LOW, MEDIUM, HIGH, URGENT
- Assignee, due date, estimated hours
- Task dependencies (block/blocked-by relationships)
- Drag-and-drop reordering (via @dnd-kit)

**Who uses it:**
- PROJECT_MANAGER: Create and assign tasks
- CONTRIBUTOR: Update task status, log progress
- CLIENT: View-only (can see what's being worked on)

### 4.3 Files

**What it is:** Centralized file storage for all project assets.

**Key features:**
- Upload files up to 2GB (configurable via `MAX_FILE_SIZE_BYTES`)
- File versioning — upload a new version of an existing file
- Annotations — leave comments on specific files
- Virus scanning (disabled by default, requires ClamAV)
- Storage backends: AWS S3 or Cloudflare R2
- Download with pre-signed URLs (secure, time-limited)
- File type detection and icons

**Who uses it:**
- ADMIN/PROJECT_MANAGER/CONTRIBUTOR: Upload files
- CLIENT: Download files shared with them
- All roles: View files in their accessible projects

### 4.4 Messages

**What it is:** Real-time project-scoped messaging, like Slack channels but per-project.

**Key features:**
- Each project has one or more channels (e.g. "general", "design-feedback")
- Real-time delivery via Socket.io
- Message history persisted in MongoDB
- File attachments in messages
- Read receipts
- Typing indicators
- @mentions

**Who uses it:**
- All roles: Send and receive messages in channels they have access to
- Clients communicate directly with the agency team within their project

### 4.5 Invoices

**What it is:** Invoice creation, sending, and payment collection.

**Key features:**
- Invoice lifecycle: DRAFT → SENT → VIEWED → PARTIAL → PAID → OVERDUE → VOID
- Line items with quantity, unit price, tax
- PDF generation (pdf-lib)
- Email delivery to client
- Stripe payment integration — clients pay directly from the invoice
- Overdue detection via scheduled jobs (runs daily)
- Milestone-triggered invoice creation

**Who uses it:**
- ADMIN/PROJECT_MANAGER: Create and send invoices
- CLIENT: View invoices, pay via Stripe
- Scheduled jobs: Auto-mark overdue invoices

### 4.6 Contracts

**What it is:** Digital contract creation and e-signature collection.

**Key features:**
- Contract types: SERVICE_AGREEMENT, NDA, PROPOSAL, RETAINER, CUSTOM
- Status: DRAFT → SENT → VIEWED → SIGNED → EXECUTED → EXPIRED
- PDF generation with contract content
- Digital signature capture (react-signature-canvas)
- Signature hash verification (SHA-256 of signature data)
- Contract templates for reuse

**Who uses it:**
- ADMIN/PROJECT_MANAGER: Create contracts from templates, send to clients
- CLIENT: View, sign contracts digitally

### 4.7 Approvals

**What it is:** Structured workflow for getting client sign-off on deliverables.

**Key features:**
- Approval statuses: PENDING → APPROVED / REJECTED / REVISION_REQUESTED
- Revision tracking — each rejection creates a revision record with feedback
- File attachments (the deliverable being reviewed)
- Email notification to client when approval is requested
- Feedback/comments on rejection

**Who uses it:**
- ADMIN/PROJECT_MANAGER: Create approval requests, attach deliverables
- CLIENT: Review deliverables, approve or request revisions
- CONTRIBUTOR: View approval status

### 4.8 Analytics

**What it is:** Business intelligence dashboard for agency owners.

**Key features:**
- Revenue metrics: total, outstanding, collected, growth vs. last month
- Project metrics: active, completed, by status
- Client metrics: active clients, NPS scores
- Invoice metrics: overdue count, collection rate
- Charts powered by Recharts

**Who uses it:**
- SUPERADMIN/ADMIN: Full analytics dashboard
- PROJECT_MANAGER: Limited view (their projects only)

### 4.9 Automations

**What it is:** Event-driven automation rules to reduce manual work.

**Key features:**
- Trigger events: project status change, invoice overdue, task completed, approval received
- Conditions: filter by project type, client tier, amount, etc.
- Actions: send email, create task, update status, send notification
- Enable/disable rules without deleting them

**Example automations:**
- "When a milestone is completed → create an invoice"
- "When an invoice is 7 days overdue → send reminder email to client"
- "When a project moves to REVIEW → notify the PM"

**Who uses it:**
- SUPERADMIN/ADMIN: Create and manage automation rules

### 4.10 Notifications

**What it is:** In-app notification system for real-time alerts.

**Key features:**
- Notification types: task assigned, invoice due, approval needed, message received, file uploaded
- Real-time delivery via Socket.io
- Unread count badge in the top bar
- Mark as read / mark all as read
- Auto-deletion after 90 days (MongoDB TTL index)
- Email digest options: none, hourly, daily

**Who uses it:**
- All roles receive notifications relevant to their work

### 4.11 Clients (Admin)

**What it is:** Client relationship management for the agency.

**Key features:**
- Client tiers: STARTER, GROWTH, ENTERPRISE (affects storage limits)
- Storage limits: 5GB / 50GB / 500GB
- Client portal invitation — send magic link to client's email
- Client health score (calculated from project health scores)
- Contact information, billing address, website

**Who uses it:**
- SUPERADMIN/ADMIN: Create clients, invite client users, manage relationships

### 4.12 Team (Admin)

**What it is:** Team member management for the agency.

**Key features:**
- Invite team members by email (sends temporary password)
- Assign roles: ADMIN, PROJECT_MANAGER, CONTRIBUTOR
- Activate/deactivate accounts
- View last login time
- Promote to SUPERADMIN (SUPERADMIN only)

**Who uses it:**
- SUPERADMIN/ADMIN: Manage the agency team

### 4.13 Settings

**What it is:** User account preferences.

**Tabs:**
- **Profile**: Update display name
- **Security**: Change password
- **Notifications**: Toggle notification preferences per event type
- **Appearance**: Light/dark theme toggle

**Who uses it:**
- All roles: Manage their own account settings

---

## 5. User Workflows by Role

### Agency Owner (SUPERADMIN) Workflow

1. Register at `/auth/register` → automatically gets CLIENT role
2. Promote yourself to SUPERADMIN (see Section 9)
3. Go to Admin → Clients → Create your first client
4. Go to Admin → Team → Invite team members (PM, contributors)
5. Create a project, assign the PM and contributors
6. Set up milestones and budget
7. Create a contract from a template, send to client for signing
8. As work progresses, create approval requests for deliverables
9. When a milestone is completed, create and send an invoice
10. Monitor everything from the Analytics dashboard

### Project Manager Workflow

1. Receive invitation email with temporary password
2. Log in, change password in Settings → Security
3. View assigned projects on the Projects page
4. Create tasks on the Kanban board, assign to contributors
5. Upload deliverables to Files
6. Create approval requests for client review
7. Communicate with client via Messages
8. Update project status as work progresses
9. View invoice status (read-only)

### Contributor Workflow

1. Receive invitation email with temporary password
2. Log in, change password
3. View assigned projects
4. Update task status on the Kanban board
5. Upload files (assets, deliverables)
6. Send messages in project channels
7. View approval status

### Client Workflow

1. Receive invitation email with magic link (or set up password)
2. Click magic link → automatically logged in to their portal
3. See their project(s) on the Dashboard
4. View project progress, milestones, health score
5. Download files shared by the agency
6. Review and approve/reject deliverables in Approvals
7. Sign contracts digitally in Contracts
8. Pay invoices via Stripe in Invoices
9. Communicate with the agency team in Messages

---

## 6. Technical Architecture

### Backend Architecture

```
backend/src/
├── app.ts              — Express app setup (middleware, routes)
├── server.ts           — HTTP server, DB connections, graceful shutdown
├── config/
│   ├── db.ts           — MongoDB connection with retry logic
│   ├── env.ts          — Zod-validated environment variables
│   ├── redis.ts        — Redis connection with graceful fallback
│   └── storage.ts      — S3/R2 abstraction layer
├── lib/
│   ├── crypto.ts       — AES-256-GCM encryption, SHA-256, secure tokens
│   ├── email.ts        — Nodemailer SMTP + HTML email templates
│   ├── errors.ts       — Custom error classes
│   ├── jwt.ts          — Access/refresh token sign & verify
│   ├── logger.ts       — Pino structured logging
│   ├── passport.ts     — Google OAuth 2.0 strategy
│   ├── pdf.ts          — PDF generation (pdf-lib)
│   └── stripe.ts       — Stripe client
├── middleware/
│   ├── authenticate.ts — JWT verification, user caching
│   ├── authorize.ts    — RBAC permission checks
│   ├── auditLog.ts     — Audit trail middleware
│   ├── errorHandler.ts — Global error handler
│   ├── rateLimiter.ts  — Express rate limiting
│   ├── requestId.ts    — Request ID injection
│   └── validate.ts     — Zod schema validation
├── models/             — 15 Mongoose models
├── modules/            — 13 feature modules (routes + service)
├── sockets/
│   └── socketServer.ts — Socket.io with JWT auth + Redis adapter
├── types/
│   └── express.d.ts    — Global Express type augmentation
└── workers/
    ├── emailWorker.ts  — Bull queue for async email
    ├── invoiceWorker.ts — Bull queue for PDF generation
    ├── scanWorker.ts   — Bull queue for virus scanning
    └── scheduledJobs.ts — Cron jobs (overdue invoices, health scores)
```

### Frontend Architecture

```
frontend/src/
├── App.tsx             — Router with protected/guest/role guards
├── main.tsx            — React Query setup, error boundary
├── index.css           — Tailwind + CSS variables (light/dark themes)
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx  — Main layout (sidebar + topbar + outlet)
│   │   ├── Sidebar.tsx   — Navigation (desktop collapsible + mobile drawer)
│   │   └── TopBar.tsx    — Header (search, notifications, user menu)
│   ├── modules/          — Feature-specific components
│   └── ui/               — Reusable UI primitives (Radix UI based)
├── hooks/
│   ├── useAuth.ts        — Auth mutations (login, register, magic link, etc.)
│   ├── useNotifications.ts — Notification polling + mutations
│   └── useSocket.ts      — Socket.io connection management
├── pages/               — One directory per feature
├── services/
│   └── api.ts           — Axios instance with token refresh interceptor
└── stores/
    ├── authStore.ts      — User + access token (persisted)
    ├── uiStore.ts        — Theme, sidebar state (persisted)
    └── notificationStore.ts — Unread count
```

### Real-Time Architecture

Socket.io is used for:
- New messages in channels
- New notifications
- Typing indicators
- User presence (online/offline)

The socket server authenticates connections using the JWT access token. Each user joins rooms for their projects. When a message is sent or a notification is created, the server emits to the relevant room.

In production with multiple backend instances, the Redis adapter (`@socket.io/redis-adapter`) ensures events are broadcast across all instances.

### Background Jobs

Bull queues (backed by Redis) handle:
- **Email queue**: Async email sending — prevents slow SMTP from blocking API responses
- **Invoice PDF queue**: PDF generation is CPU-intensive, done in background
- **Scan queue**: Virus scanning of uploaded files (disabled by default)

Scheduled cron jobs (node-cron):
- Every hour: Mark invoices as OVERDUE if past due date
- Every day at 9am: Send invoice reminders to clients
- Every 6 hours: Recalculate project health scores

---

## 7. Environment Variables Reference

### Backend (.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | ✅ | MongoDB connection string. Special chars in password must be URL-encoded (@ → %40) |
| `REDIS_URL` | ✅ | Redis connection string. App works without Redis but with degraded security |
| `JWT_ACCESS_SECRET` | ✅ | Min 32 chars. Signs 15-minute access tokens |
| `JWT_REFRESH_SECRET` | ✅ | Min 32 chars. Signs 7-day refresh tokens |
| `SMTP_HOST` | For email | `smtp.gmail.com` for Gmail |
| `SMTP_PORT` | For email | `587` for TLS, `465` for SSL |
| `SMTP_USER` | For email | Your Gmail address |
| `SMTP_PASS` | For email | 16-char Gmail App Password (NOT your regular password) |
| `GOOGLE_CLIENT_ID` | For Google OAuth | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | For Google OAuth | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | For Google OAuth | Must match GCP authorized redirect URI |
| `STRIPE_SECRET_KEY` | For payments | From Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | For payments | From Stripe webhook settings |
| `ENCRYPTION_KEY` | For contracts | Min 32 chars. Encrypts sensitive data |
| `MAGIC_LINK_BASE_URL` | For magic links | Frontend URL + `/auth/magic` |
| `AGENCY_NAME` | No | Displayed in emails |
| `AGENCY_EMAIL` | No | Shown in email footers |

### Frontend (.env)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API URL (e.g. `http://localhost:5000/api/v1`) |
| `VITE_APP_NAME` | App name displayed in browser tab |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (safe to expose in frontend) |

⚠️ **Never put `STRIPE_SECRET_KEY` or any secret in the frontend `.env`** — it gets bundled into the JavaScript and is visible to anyone.

---

## 8. MongoDB & Server Health

### Checking if MongoDB is connected

**Option 1: Health endpoint (no auth)**
```
GET http://localhost:5000/health
```
Returns: `{ "status": "ok", "env": "development", "timestamp": "..." }`

**Option 2: DB health endpoint (requires ADMIN/SUPERADMIN auth)**
```
GET http://localhost:5000/api/v1/admin/db-health
Authorization: Bearer <your_access_token>
```
Returns:
```json
{
  "success": true,
  "data": {
    "status": "connected",
    "readyState": 1,
    "database": "agency-os",
    "totalUsers": 3,
    "recentUsers": [
      { "name": "Jane Smith", "email": "jane@agency.com", "role": "SUPERADMIN", ... }
    ]
  }
}
```

This tells you:
- Whether MongoDB is connected
- Which database you're connected to
- How many users are registered
- The most recent 20 users (so you can see who registered and their roles)

### MongoDB URI note

Your current URI has a password with a special character (`@`). In a connection string, `@` must be URL-encoded as `%40`:

```
# Wrong (breaks the URI parser):
mongodb+srv://vibedev:vibedev@2026@agencyos...

# Correct:
mongodb+srv://vibedev:vibedev%402026@agencyos...
```

This has been fixed in your `.env` file.

---

## 9. Promoting a User to SUPERADMIN

### On a fresh install (no SUPERADMIN exists yet)

Use the bootstrap endpoint — **no authentication required**, but only works when zero SUPERADMINs exist:

```bash
curl -X POST http://localhost:5000/api/v1/auth/bootstrap-superadmin \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com"}'
```

Or with PowerShell:
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/v1/auth/bootstrap-superadmin" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "your@email.com"}'
```

**Steps:**
1. Register your account at `http://localhost:5173/auth/register`
2. Call the bootstrap endpoint with your email
3. Log out and log back in — your role is now SUPERADMIN

Once a SUPERADMIN exists, this endpoint returns 403 and cannot be used again.

### When a SUPERADMIN already exists

Use the admin panel:
1. Log in as SUPERADMIN
2. Go to Admin → Team
3. Find the user you want to promote
4. Use the API directly (the UI role selector doesn't show SUPERADMIN as an option for safety):

```bash
# First get your access token from the browser's localStorage (agency-os-auth key)
curl -X PATCH http://localhost:5000/api/v1/admin/team/<USER_ID>/promote-superadmin \
  -H "Authorization: Bearer <your_superadmin_access_token>"
```

### On a production server (MongoDB Atlas)

If you need to promote a user directly in the database:

1. Go to MongoDB Atlas → your cluster → Browse Collections
2. Select the `agency-os` database → `users` collection
3. Find your user document
4. Click Edit → change `"role": "CLIENT"` to `"role": "SUPERADMIN"`
5. Save

Or use the MongoDB shell:
```javascript
db.users.updateOne(
  { email: "mohammedsharifazhan974@gmail.com" },
  { $set: { role: "SUPERADMIN" } }
)
```

---

## 10. Magic Link — Complete Flow Verification

The magic link system is **fully implemented** and works as follows:

1. ✅ `POST /api/v1/auth/magic-link` — generates token, stores hash in Redis, sends email
2. ✅ Email template in `backend/src/lib/email.ts` → `getMagicLinkEmail()`
3. ✅ SMTP via Nodemailer with Gmail App Password
4. ✅ `POST /api/v1/auth/magic-link/verify` — verifies token, deletes from Redis (single-use), issues JWT
5. ✅ Frontend `LoginPage.tsx` — "Sign in with magic link" button
6. ✅ Frontend auto-verifies token from URL on page load
7. ✅ `useVerifyMagicLink` hook handles the verification and navigation

**What you need to do to make it work:**
- Update `SMTP_USER` in `backend/.env` to the Gmail address that owns the app password
- The app password `yzutgcspssoxpbgg` is already set in `SMTP_PASS`
- Redis must be running (magic link tokens are stored there)

---

## 11. Google OAuth — Complete Flow Verification

Google OAuth is **fully implemented**:

1. ✅ `backend/src/lib/passport.ts` — Passport Google strategy
2. ✅ `GET /api/v1/auth/google` — redirects to Google consent screen
3. ✅ `GET /api/v1/auth/google/callback` — handles callback, issues JWT, redirects to frontend
4. ✅ `frontend/src/pages/auth/GoogleCallbackPage.tsx` — reads token from URL hash
5. ✅ `frontend/src/App.tsx` — `/auth/google/callback` route registered
6. ✅ "Sign in with Google" button on `LoginPage.tsx`
7. ✅ Google credentials configured in `.env`

**What you need to verify in Google Cloud Console:**
- The authorized redirect URI must be exactly: `http://localhost:5000/api/v1/auth/google/callback`
- For production, add your production URL as an additional authorized redirect URI

---

## 12. Security Notes

- **Stripe secret key** was removed from `frontend/.env` — it should only be in `backend/.env`
- **MongoDB URI** password URL-encoding fixed (`@` → `%40`)
- **JWT secrets** are 64-character hex strings — strong enough for production
- **Encryption key** is 32 characters — used for AES-256-GCM encryption of sensitive contract data
- **Session secret** is 64-character hex — used for cookie signing
- All passwords hashed with Argon2id (the strongest password hashing algorithm available)
- Rate limiting on all auth endpoints (stricter on magic link and password reset)
- MongoDB injection prevention via `express-mongo-sanitize`
- Security headers via Helmet
- CORS restricted to known frontend origins
