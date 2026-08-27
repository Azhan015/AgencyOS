# Agency OS — Internship Project Team Division

> A 4-person internship team built Agency OS — a full-stack client management platform for agencies.
> Below is the exact division of work across all 4 members.

---

## Team Overview

| # | Name | Role | Primary Domain | Complexity |
|---|------|------|----------------|------------|
| 1 | **Mohammed Sharif Azhan** | Backend Lead | Authentication, Security, Infrastructure | 9/10 |
| 2 | **Sumit Ranjan** | Backend Developer | Business Logic, APIs, Integrations | 8/10 |
| 3 | **Nelson Valankani** | Frontend Lead | UI Architecture, Core Pages, State Management | 7/10 |
| 4 | **Yukta Sharma** | Frontend Developer | Feature Pages, Components, UX | 6/10 |

---

## Person 1 — Mohammed Sharif Azhan (Backend Lead)
### Authentication, Security & Infrastructure
### Complexity: 9/10 — Hardest role in the project

Azhan owned the entire backend foundation — the security layer and infrastructure that everything else depends on. A single mistake here compromises the entire application.

### Files Owned

**Authentication System**
- `backend/src/modules/auth/auth.service.ts` — Full auth business logic: register, login, refresh tokens, magic links, password reset, device tracking
- `backend/src/modules/auth/auth.controller.ts` — HTTP handlers for all auth endpoints
- `backend/src/modules/auth/auth.routes.ts` — Route definitions with Zod validation schemas

**Security Middleware**
- `backend/src/middleware/authenticate.ts` — JWT verification, session revocation check, user caching (5-min TTL in Redis)
- `backend/src/middleware/authorize.ts` — Role-based access control (RBAC) with 5 roles and full permission matrix (120 combinations)
- `backend/src/middleware/rateLimiter.ts` — Rate limiting (general 200/min, auth 10/min, upload 20/min, strict 5/min)
- `backend/src/middleware/validate.ts` — Zod schema validation middleware
- `backend/src/middleware/errorHandler.ts` — Global error handler (Zod, Mongoose, AppError, 500 fallback)
- `backend/src/middleware/requestId.ts` — Request ID injection for distributed tracing
- `backend/src/middleware/auditLog.ts` — Audit trail middleware for all mutating operations

**Core Infrastructure**
- `backend/src/config/env.ts` — Zod-validated environment schema (40+ variables with transforms)
- `backend/src/config/db.ts` — MongoDB connection with retry logic (5 retries, exponential backoff)
- `backend/src/config/redis.ts` — Redis client with graceful degradation (server works without Redis)
- `backend/src/lib/jwt.ts` — JWT sign/verify helpers (access 15min + refresh 7d tokens)
- `backend/src/lib/crypto.ts` — Secure token generation, SHA-256 hashing, AES-256-GCM encryption
- `backend/src/lib/errors.ts` — Custom error class hierarchy (8 error types with HTTP status codes)
- `backend/src/lib/logger.ts` — Pino structured logger with sensitive field redaction
- `backend/src/server.ts` — HTTP server bootstrap, graceful shutdown, signal handling (SIGTERM/SIGINT)
- `backend/src/app.ts` — Express app composition, middleware chain, CORS, route mounting

**Models**
- `backend/src/models/User.ts` — User schema with Argon2id hashing, device tracking, `toSafeObject()`, `findByEmail()` static

**Workers & Jobs**
- `backend/src/workers/emailWorker.ts` — Bull email queue with Redis-optional fallback
- `backend/src/workers/scheduledJobs.ts` — Cron jobs: overdue invoices (hourly), reminders (daily 9am), health scores (every 6h)

**Docker & Deployment**
- `backend/Dockerfile` — Multi-stage Docker build (builder + production)
- `docker-compose.yml` — Full stack orchestration (MongoDB, Redis, backend, frontend)

### Why 9/10 Complexity
| Challenge | Why It's Hard |
|-----------|--------------|
| JWT refresh token rotation with family tracking | Stateful token management, reuse detection, race conditions |
| Argon2id hashing parameters | Security-critical — wrong params = vulnerable to brute force |
| Redis-optional graceful degradation | Had to redesign entire connection layer to not crash on missing Redis |
| RBAC permission matrix | 5 roles × 12 resources × read/write = 120 permission combinations |
| Zod environment validation | 40+ variables, type transforms, cross-field dependencies |
| Graceful shutdown | SIGTERM/SIGINT handling, connection draining, 30s force-exit |
| Pino logger with field redaction | Structured logging, passwords/tokens must never appear in logs |

### What Azhan Can Present
- "I implemented JWT refresh token rotation — when a stolen token is reused, the entire session family is revoked automatically"
- "I built Redis-optional architecture — the server degrades gracefully instead of crashing when Redis is unavailable"
- "I designed the RBAC system — 5 roles with granular permissions, enforced at the middleware level before any business logic runs"
- "I used Argon2id for password hashing — it's memory-hard, making GPU-based brute force attacks 100x more expensive than bcrypt"

---

## Person 2 — Sumit Ranjan (Backend Developer)
### Business Logic, APIs & Third-Party Integrations
### Complexity: 8/10 — Most volume of code, second hardest

Sumit built all the feature modules — the actual business logic that powers every page in the app. He owns the most files (~26) and the most external service integrations.

### Files Owned

**Project Management Module**
- `backend/src/modules/projects/projects.service.ts` — Project CRUD, milestone management, health score computation, activity log
- `backend/src/modules/projects/projects.controller.ts` — HTTP handlers
- `backend/src/modules/projects/projects.routes.ts` — Routes with Zod validation
- `backend/src/models/Project.ts` — Project schema with milestones, health score, contributors
- `backend/src/models/Task.ts` — Task schema with Kanban status, priority, assignees, dependencies
- `backend/src/models/Brief.ts` — Project brief/questionnaire schema
- `backend/src/modules/tasks/tasks.service.ts` — Task CRUD, bulk reorder, assignee notifications
- `backend/src/modules/tasks/tasks.routes.ts` — Task routes

**Client Management Module**
- `backend/src/modules/clients/clients.service.ts` — Client CRUD, invitation flow, accept invite, analytics
- `backend/src/modules/clients/clients.controller.ts` — HTTP handlers
- `backend/src/modules/clients/clients.routes.ts` — Routes
- `backend/src/models/Client.ts` — Client schema with tier-based storage limits, Stripe customer ID

**Invoice & Payment Module**
- `backend/src/modules/invoices/invoices.service.ts` — Invoice CRUD, PDF generation, Stripe checkout session, webhook handling, overdue marking
- `backend/src/modules/invoices/invoices.routes.ts` — Routes including Stripe webhook endpoint (raw body)
- `backend/src/models/Invoice.ts` — Invoice schema with line items, tax, discount, payment tracking
- `backend/src/lib/stripe.ts` — Stripe client, customer creation, checkout sessions, webhook verification, refunds
- `backend/src/workers/invoiceWorker.ts` — Bull queue for async PDF generation (Redis-optional)

**Contract Module**
- `backend/src/modules/contracts/contracts.service.ts` — Contract CRUD, send, sign with hash verification, dual-party execution logic
- `backend/src/modules/contracts/contracts.routes.ts` — Routes
- `backend/src/models/Contract.ts` — Contract schema with dual signatures, cryptographic hash
- `backend/src/models/ContractTemplate.ts` — Template schema with `{{variable}}` injection

**Approval Module**
- `backend/src/modules/approvals/approvals.service.ts` — Approval CRUD, approve/reject/revision workflow, client notifications, socket events
- `backend/src/modules/approvals/approvals.routes.ts` — Routes including unified review endpoint
- `backend/src/models/Approval.ts` — Approval schema with revision history

**File Management Module**
- `backend/src/modules/files/files.service.ts` — File upload (multer), S3/R2 storage, version management, annotations, virus scan queue
- `backend/src/modules/files/files.routes.ts` — Routes with upload rate limiter
- `backend/src/models/File.ts` — File schema with annotations, scan status, version chain
- `backend/src/config/storage.ts` — AWS S3 / Cloudflare R2 client, signed URLs, multipart upload
- `backend/src/workers/scanWorker.ts` — Bull queue for virus scanning (Redis-optional)

**PDF Generation**
- `backend/src/lib/pdf.ts` — Invoice PDF (pdf-lib, pixel-perfect A4 layout) and contract PDF generation

### Why 8/10 Complexity
| Challenge | Why It's Hard |
|-----------|--------------|
| Stripe Checkout + webhook handling | Async payment events, idempotency, signature verification |
| Contract dual-party signing | Cryptographic integrity, 6-state machine (DRAFT→SENT→VIEWED→SIGNED→EXECUTED→EXPIRED) |
| Invoice PDF generation | Pixel-level coordinate math, font embedding, A4 layout |
| File upload pipeline | Multi-step async: multer → S3 → scan queue → available |
| Automation engine | Dynamic rule evaluation, nested condition operators |
| Project health score | Multi-factor algorithm (overdue milestones + tasks + end date) |
| MongoDB aggregation queries | `$group`, `$match`, `$sort` pipelines for analytics |

### What Sumit Can Present
- "I built the complete invoice lifecycle — from DRAFT through PAID, with Stripe Checkout integration and automatic PDF generation"
- "I implemented contract signing with cryptographic hash verification — `SHA-256(content + signature + timestamp)` makes tampering detectable"
- "I designed the file upload pipeline — files go through multer → S3/R2 → virus scan queue before becoming available to users"
- "I built the automation engine — rules evaluate trigger events against conditions and execute actions like sending emails or creating tasks"

---

## Person 3 — Nelson Valankani (Frontend Lead)
### UI Architecture, Core Pages & State Management
### Complexity: 7/10 — Architecturally complex, less volume

Nelson built the frontend foundation — routing, state management, API layer, and the core app shell. His code is the glue that holds the entire frontend together.

### Files Owned

**App Foundation**
- `frontend/src/App.tsx` — Complete routing (landing, auth, protected app routes, single layout nesting)
- `frontend/src/main.tsx` — React entry point, QueryClient setup, StrictMode
- `frontend/src/index.css` — Tailwind base, CSS custom properties (light/dark theme tokens), animations
- `frontend/src/vite-env.d.ts` — Vite environment type declarations
- `frontend/vite.config.ts` — Vite config with path aliases, dev proxy, production chunking
- `frontend/tailwind.config.js` — Tailwind theme extension (colors, radius, fonts, keyframes)
- `frontend/postcss.config.js` — PostCSS config
- `frontend/index.html` — HTML shell with theme flash prevention inline script

**State Management**
- `frontend/src/stores/authStore.ts` — Zustand auth store (user, token, isAuthenticated, persisted to localStorage)
- `frontend/src/stores/uiStore.ts` — Zustand UI store (theme, sidebar, command palette, persisted)
- `frontend/src/stores/notificationStore.ts` — Zustand notification store (in-memory, real-time updates)

**API & Services**
- `frontend/src/services/api.ts` — Axios instance, Bearer token interceptor, 401 refresh queue (prevents race conditions), production env var support

**Hooks**
- `frontend/src/hooks/useAuth.ts` — All auth mutations: useRegister, useLogin, useLogout, useMagicLink, useVerifyMagicLink, useForgotPassword, useResetPassword, useMe
- `frontend/src/hooks/useSocket.ts` — Socket.io connection lifecycle, project room management, real-time event handlers
- `frontend/src/hooks/useNotifications.ts` — Notification polling (30s interval), mark read, mark all read

**Layout Components**
- `frontend/src/components/layout/AppShell.tsx` — Main layout wrapper (sidebar + topbar + outlet + command palette + toaster)
- `frontend/src/components/layout/Sidebar.tsx` — Fixed sidebar with nav items, role-based admin section, collapse toggle
- `frontend/src/components/layout/TopBar.tsx` — Search trigger, theme toggle, notification bell, user dropdown

**Core Pages**
- `frontend/src/pages/LandingPage.tsx` — Public landing page (hero, features grid, stats, CTA, footer)
- `frontend/src/pages/auth/LoginPage.tsx` — Login form + magic link mode + auto-verify from URL token
- `frontend/src/pages/auth/RegisterPage.tsx` — Registration form with confirm password validation
- `frontend/src/pages/auth/ForgotPasswordPage.tsx` — Forgot password with sent confirmation state
- `frontend/src/pages/auth/ResetPasswordPage.tsx` — Reset password from token URL
- `frontend/src/pages/dashboard/DashboardPage.tsx` — KPI cards (GSAP animated), recent projects, activity feed, role-aware layout

**Utility Library**
- `frontend/src/lib/utils.ts` — cn(), formatDate, formatRelativeTime, formatCurrency, formatBytes, getInitials, generateAvatarColor, debounce, getFileIcon, STATUS_COLORS

### Why 7/10 Complexity
| Challenge | Why It's Hard |
|-----------|--------------|
| Axios interceptor with refresh queue | Prevents multiple simultaneous refresh calls, queues failed requests, no infinite loops |
| React Router v6 nested layout routing | Single AppShell mount, layout route nesting, protected + auth route wrappers |
| Zustand persist middleware | Selective persistence, hydration timing, auth state rehydration on page load |
| Socket.io hook lifecycle | Connection management, event cleanup on unmount, reconnection handling |
| Theme flash prevention | Inline script must run before React hydrates — wrong order = white flash |
| GSAP animations | Timeline sequencing, stagger effects, cleanup on component unmount |
| QueryClient configuration | Retry logic per status code, stale time, error boundary integration |

### What Nelson Can Present
- "I built the Axios interceptor with a request queue — when a 401 happens, all concurrent requests pause, one refresh call is made, then all queued requests retry with the new token"
- "I designed the routing architecture — a single AppShell layout route means the sidebar and topbar never remount when navigating between pages"
- "I implemented theme flash prevention — an inline script in index.html reads localStorage before React loads, so the correct theme is applied before the first paint"
- "I built the Socket.io hook — it manages connection lifecycle, joins/leaves project rooms, and cleans up all event listeners on unmount"

---

## Person 4 — Yukta Sharma (Frontend Developer)
### Feature Pages, Module Components & UI System
### Complexity: 6/10 — Most files, most visible, most user-facing

Yukta built all the feature-specific pages and the reusable component library. She owns the most files (~28) and everything the user directly sees and interacts with.

### Files Owned

**UI Component Library**
- `frontend/src/components/ui/button.tsx` — Button with 6 variants, 5 sizes, loading spinner, asChild support
- `frontend/src/components/ui/input.tsx` — Input with label, error message, left/right icon slots
- `frontend/src/components/ui/card.tsx` — Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- `frontend/src/components/ui/dialog.tsx` — Radix Dialog with overlay, close button, enter/exit animations
- `frontend/src/components/ui/dropdown-menu.tsx` — Radix DropdownMenu with all sub-components
- `frontend/src/components/ui/avatar.tsx` — Radix Avatar + UserAvatar convenience component with deterministic color generation
- `frontend/src/components/ui/badge.tsx` — Badge with 7 variants (default, secondary, destructive, success, warning, info, outline)
- `frontend/src/components/ui/skeleton.tsx` — Animated skeleton loader
- `frontend/src/components/ui/status-pill.tsx` — Colored status pill for all 20+ entity states

**Project Module Components**
- `frontend/src/components/modules/projects/TaskBoard.tsx` — Kanban board with 4 columns, task cards, quick status change, create task dialog
- `frontend/src/components/modules/projects/MilestoneTimeline.tsx` — Visual milestone timeline (horizontal dots + connector lines) + list view
- `frontend/src/components/modules/projects/ProjectFiles.tsx` — Drag-and-drop upload zone, grid/list view toggle, version badges, download/delete
- `frontend/src/components/modules/projects/ProjectMessages.tsx` — In-project chat with channel sidebar, message bubbles, real-time polling
- `frontend/src/components/modules/projects/ProjectApprovals.tsx` — Approval cards with approve/reject/revision dialogs, revision history display
- `frontend/src/components/modules/projects/ProjectInvoices.tsx` — Project-scoped invoice list with status pills and deep links

**Notification & Command Components**
- `frontend/src/components/modules/notifications/NotificationPanel.tsx` — Slide-in notification panel with mark read, mark all read, click-to-navigate
- `frontend/src/components/modules/command/CommandPalette.tsx` — ⌘K command palette with grouped navigation and action commands

**Feature Pages — Projects**
- `frontend/src/pages/projects/ProjectsPage.tsx` — Project grid with search, status filters, health score bars, create project dialog
- `frontend/src/pages/projects/ProjectDetailPage.tsx` — Project header (stats, team avatars), 6-tab interface (Overview/Tasks/Files/Messages/Approvals/Invoices)

**Feature Pages — Invoices & Contracts**
- `frontend/src/pages/invoices/InvoicesPage.tsx` — Invoice list with summary cards, status filters, send/payment link/download actions
- `frontend/src/pages/invoices/InvoiceDetailPage.tsx` — Full invoice view with line items table, totals breakdown, send/void/payment link
- `frontend/src/pages/contracts/ContractsPage.tsx` — Contract list with status filters, send/sign actions
- `frontend/src/pages/contracts/ContractDetailPage.tsx` — Contract body viewer, signature display, sign button for clients

**Feature Pages — Communication & Files**
- `frontend/src/pages/messages/MessagesPage.tsx` — Full messaging UI with channel sidebar, message bubbles, real-time Socket.io, Enter to send
- `frontend/src/pages/files/FilesPage.tsx` — Global files view with search, type filters, download/delete
- `frontend/src/pages/approvals/ApprovalsPage.tsx` — Approvals list with summary cards, inline approve/reject, detail dialog with feedback

**Feature Pages — Admin**
- `frontend/src/pages/admin/ClientsPage.tsx` — Client grid with search, tier badges, invite/resend, create client dialog
- `frontend/src/pages/admin/ClientDetailPage.tsx` — Client detail with 4-tab view (Overview/Projects/Invoices/Contracts)
- `frontend/src/pages/admin/TeamPage.tsx` — Team member list with role selector, activate/deactivate, invite dialog
- `frontend/src/pages/admin/AnalyticsPage.tsx` — KPI cards, revenue area chart (Recharts), project/invoice summary
- `frontend/src/pages/admin/AutomationsPage.tsx` — Automation rules list with toggle/delete, create rule dialog

**Feature Pages — Settings**
- `frontend/src/pages/settings/SettingsPage.tsx` — 4-tab settings (Profile, Notifications, Security, Appearance) with password change, theme toggle

**Docker & Deployment**
- `frontend/Dockerfile` — Multi-stage build (Node builder + Nginx production)
- `frontend/nginx.conf` — Nginx config with API proxy, Socket.io proxy, SPA fallback, gzip, asset caching

### Why 6/10 Complexity
| Challenge | Why It's Hard |
|-----------|--------------|
| Kanban board state management | Status changes across columns, optimistic updates, reorder logic |
| Real-time messaging UI | Socket events, scroll-to-bottom, channel switching, message deduplication |
| File upload with drag-and-drop | react-dropzone, FormData, multipart, version detection |
| Recharts with CSS variable theming | Dynamic data, responsive containers, custom tooltips matching dark/light theme |
| Radix UI component library | Accessibility props, compound components, forwarded refs, polymorphic asChild |
| Role-based conditional rendering | Every page shows/hides actions based on user role + entity status |
| 28 files with consistent patterns | Loading states, empty states, error states, and role checks on every page |

### What Yukta Can Present
- "I built the complete UI component library on Radix UI primitives — every component is keyboard-navigable and screen-reader accessible out of the box"
- "I implemented the Kanban task board — tasks can be moved between columns with instant status updates and the board reflects real-time changes"
- "I built the analytics dashboard with Recharts — the revenue chart uses CSS custom properties so it automatically adapts to light and dark mode"
- "I designed the approval workflow UI — clients can approve, reject, or request revisions with feedback, and the revision history is displayed inline"

---

## Shared Responsibilities

| Item | Contributors |
|------|-------------|
| `backend/src/models/Message.ts`, `Channel.ts` | Sumit + Nelson |
| `backend/src/models/Notification.ts`, `AuditLog.ts`, `AutomationRule.ts` | Sumit + Azhan |
| `backend/src/modules/messages/messages.service.ts`, `messages.routes.ts` | Sumit + Nelson |
| `backend/src/modules/notifications/notifications.service.ts`, `notifications.routes.ts` | Sumit + Azhan |
| `backend/src/modules/analytics/analytics.service.ts`, `analytics.routes.ts` | Sumit + Yukta |
| `backend/src/modules/automations/automations.service.ts`, `automations.routes.ts` | Sumit + Azhan |
| `backend/src/modules/admin/admin.routes.ts` | Azhan + Sumit |
| `backend/src/sockets/socketServer.ts` | Azhan + Nelson |
| `README.md`, `SETUP_GUIDE.md`, `REDIS_SETUP.md` | All 4 members |
| `.env.example`, environment documentation | Azhan + Sumit |

---

## Contribution Summary

| Member | Backend Files | Frontend Files | Models | Total Files |
|--------|--------------|----------------|--------|-------------|
| Mohammed Sharif Azhan | 15 | 0 | 1 | ~16 |
| Sumit Ranjan | 18 | 0 | 8 | ~26 |
| Nelson Valankani | 0 | 16 | 0 | ~16 |
| Yukta Sharma | 0 | 28 | 0 | ~28 |
| **Shared** | 8 | 0 | 4 | ~12 |

---

## Complexity Ranking (Final)

```
Mohammed Sharif Azhan  ████████████████████  9/10  Security & Infrastructure
Sumit Ranjan           ████████████████████  8/10  Business Logic & Integrations
Nelson Valankani       ██████████████████    7/10  Frontend Architecture
Yukta Sharma           ████████████████      6/10  Feature Pages & UI System
```

**For internship evaluation:**
- **Azhan's work** is the most technically impressive — security, cryptography, infrastructure design
- **Sumit's work** is the most impressive in scope — most features, most external service integrations
- **Nelson's work** is the most impressive architecturally — patterns that every other frontend developer depends on
- **Yukta's work** is the most impressive visually — everything the user sees, touches, and interacts with
