# AgencyOS → Enterprise Multi-Tenant SaaS Platform
## Master Implementation Blueprint

> **Document Type:** Principal Engineer Architecture Specification + CTO Migration Roadmap  
> **Source System:** AgencyOS Backend v1.0.0 (DOCUMENTATION.md — Audited May 22, 2026)  
> **Target Architecture:** True Multi-Tenant Enterprise SaaS Platform  
> **Stack:** Express 4 · TypeScript 5.3 · MongoDB/Mongoose 8 · Redis (ioredis) · Bull · Socket.io 4 · JWT · Stripe · S3/R2  

---

## Table of Contents

1. [Architecture Overview & Migration Vision](#1-architecture-overview--migration-vision)
2. [Organization / Tenant Layer](#2-organization--tenant-layer)
3. [Platform-Level Admin System](#3-platform-level-admin-system)
4. [Organization Registration & Approval Flow](#4-organization-registration--approval-flow)
5. [First User = Organization Owner](#5-first-user--organization-owner)
6. [New Enterprise RBAC Hierarchy](#6-new-enterprise-rbac-hierarchy)
7. [Time-Based Trial System](#7-time-based-trial-system)
8. [Automated Email Lifecycle System](#8-automated-email-lifecycle-system)
9. [Multi-Tenant Socket.io Architecture](#9-multi-tenant-socketio-architecture)
10. [Tenant-Aware Redis & Cache Strategy](#10-tenant-aware-redis--cache-strategy)
11. [Tenant-Aware Storage System](#11-tenant-aware-storage-system)
12. [Platform Analytics](#12-platform-analytics)
13. [Database Migration Strategy](#13-database-migration-strategy)
14. [Security Impact Analysis](#14-security-impact-analysis)
15. [Implementation Roadmap](#15-implementation-roadmap)
16. [New Directory Structure](#16-new-directory-structure)
17. [Environment Variable Changes](#17-environment-variable-changes)

---

## 1. Architecture Overview & Migration Vision

### 1.1 Current State — Single-Tenant Architecture

The existing AgencyOS backend operates as a **single-tenant system** where one MongoDB database serves one agency. The RBAC hierarchy (`SUPERADMIN → ADMIN → PROJECT_MANAGER → CONTRIBUTOR → CLIENT`) is flat and unscoped. There is no concept of organizational boundaries. All users, projects, clients, invoices, files, and contracts live in the same namespace. The `SUPERADMIN` role has unrestricted access to everything.

Key architectural facts from the audit:
- `authenticate.ts` sets `req.user = { id, email, role, clientId, sessionId, name }` — no `organizationId`
- `authorize.ts` checks `ROLE_PERMISSIONS[role]` — no org-level scoping
- Redis keys: `client:{id}`, `user:{userId}` — no org namespace
- S3 keys: `generateStorageKey(prefix, filename)` — no org prefix
- Socket.io rooms: `user:{userId}`, `project:{projectId}` — no org isolation
- `passport.ts` creates new users with `role=CLIENT` with no org assignment
- The `bootstrap-superadmin` endpoint creates a single global superadmin — incompatible with multi-tenancy

### 1.2 Target State — Multi-Tenant Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        PLATFORM LAYER                                │
│  PLATFORM_OWNER │ PLATFORM_ADMIN │ PLATFORM_SUPPORT                 │
│  Global analytics, org management, billing oversight, impersonation  │
├──────────────────────────────────────────────────────────────────────┤
│  ORG A (Tenant 1)    │  ORG B (Tenant 2)    │  ORG C (Tenant 3)    │
│  ─────────────────   │  ─────────────────   │  ─────────────────   │
│  ORGANIZATION_OWNER  │  ORGANIZATION_OWNER  │  ORGANIZATION_OWNER  │
│  ORGANIZATION_ADMIN  │  ORGANIZATION_ADMIN  │  ORGANIZATION_ADMIN  │
│  PROJECT_MANAGER     │  PROJECT_MANAGER     │  PROJECT_MANAGER     │
│  CONTRIBUTOR         │  CONTRIBUTOR         │  CONTRIBUTOR         │
│  CLIENT              │  CLIENT              │  CLIENT              │
│                      │                      │                      │
│  Projects, Tasks,    │  Projects, Tasks,    │  Projects, Tasks,    │
│  Clients, Files,     │  Clients, Files,     │  Clients, Files,     │
│  Invoices, etc.      │  Invoices, etc.      │  Invoices, etc.      │
├──────────────────────────────────────────────────────────────────────┤
│                   SHARED INFRASTRUCTURE                              │
│  MongoDB (org-scoped collections) │ Redis (org-namespaced keys)     │
│  S3/R2 (org-prefixed storage)     │ Socket.io (org rooms)           │
│  Bull Queues (org-tagged jobs)    │ Email Lifecycle (org templates)  │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.3 The Eleven Pillars of This Migration

| Pillar | What Changes |
|--------|-------------|
| **Data Layer** | Every collection gains `organizationId` field; compound indexes replace simple ones |
| **Auth Layer** | JWT payload gains `organizationId`, `orgRole`; middleware enforces tenant scope |
| **RBAC Layer** | Two-tier role system: platform roles + org roles; permission matrix split |
| **API Layer** | All routes become org-scoped; new `/platform/` prefix for admin routes |
| **Socket Layer** | Org rooms added; cross-tenant broadcast protection enforced |
| **Cache Layer** | All Redis keys org-namespaced; org-level cache invalidation groups |
| **Storage Layer** | S3/R2 keys prefixed with `organizations/{orgId}/`; per-org quotas |
| **Queue Layer** | Bull jobs tagged with `organizationId`; tenant-aware workers |
| **Email Layer** | 14 lifecycle email templates; org-specific branding variables |
| **Onboarding Layer** | Approval pipeline; trial lifecycle; cron-based state machines |
| **Analytics Layer** | Platform-wide aggregations; per-org dashboards; funnel metrics |

---

## 2. Organization / Tenant Layer

### 2.1 Organization Schema

Create `src/models/Organization.ts`:

```typescript
import mongoose, { Document, Schema } from 'mongoose';

export type OrgStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED_TRIAL'
  | 'ARCHIVED';

export type OrgPlan = 'TRIAL' | 'STARTER' | 'GROWTH' | 'ENTERPRISE';

export interface IOrganization extends Document {
  name: string;
  slug: string;                          // unique, url-safe, e.g. "acme-agency"
  domain?: string;                       // optional verified domain
  logoUrl?: string;
  status: OrgStatus;
  plan: OrgPlan;

  // Lifecycle timestamps
  registeredAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  suspendedAt?: Date;
  archivedAt?: Date;
  trialStartsAt?: Date;
  trialEndsAt?: Date;
  expiresAt?: Date;                      // subscription expiry (non-trial)

  // Approval workflow
  approvalReviewedBy?: mongoose.Types.ObjectId;  // PlatformUser._id
  approvalNotes?: string;
  rejectionReason?: string;
  approvalSubmittedAt?: Date;

  // Billing
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  billingEmail?: string;
  billingInterval?: 'monthly' | 'annual';
  mrr?: number;                          // Monthly Recurring Revenue in cents

  // Limits (plan-based)
  limits: {
    seats: number;                       // max users
    storageBytes: number;                // max storage
    projects: number;                    // max active projects (-1 = unlimited)
    clients: number;                     // max clients (-1 = unlimited)
    automations: number;                 // max automation rules
  };

  // Usage tracking
  usage: {
    seats: number;
    storageUsedBytes: number;
    projects: number;
    clients: number;
  };

  // Feature flags (org-level overrides)
  features: {
    contractModule: boolean;
    invoiceModule: boolean;
    automationsModule: boolean;
    analyticsModule: boolean;
    apiAccess: boolean;
    whiteLabel: boolean;
    customDomain: boolean;
    ssoEnabled: boolean;
  };

  // Onboarding tracking
  onboarding: {
    completedSteps: string[];
    currentStep: string;
    completedAt?: Date;
  };

  // Contact
  ownerEmail: string;                    // denormalized from first user for fast lookup
  contactPhone?: string;
  address?: {
    line1: string;
    city: string;
    country: string;
    postalCode: string;
  };

  // Audit
  registrationIp?: string;
  registrationUserAgent?: string;
  metadata: Record<string, unknown>;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    domain: { type: String, sparse: true, lowercase: true },
    logoUrl: String,
    status: {
      type: String,
      enum: ['PENDING_APPROVAL','APPROVED','REJECTED','ACTIVE','SUSPENDED','EXPIRED_TRIAL','ARCHIVED'],
      default: 'PENDING_APPROVAL',
    },
    plan: {
      type: String,
      enum: ['TRIAL','STARTER','GROWTH','ENTERPRISE'],
      default: 'TRIAL',
    },

    registeredAt: { type: Date, default: Date.now },
    approvedAt: Date,
    rejectedAt: Date,
    suspendedAt: Date,
    archivedAt: Date,
    trialStartsAt: Date,
    trialEndsAt: Date,
    expiresAt: Date,

    approvalReviewedBy: { type: Schema.Types.ObjectId, ref: 'PlatformUser' },
    approvalNotes: String,
    rejectionReason: String,
    approvalSubmittedAt: Date,

    stripeCustomerId: { type: String, sparse: true },
    stripeSubscriptionId: { type: String, sparse: true },
    stripePriceId: String,
    billingEmail: String,
    billingInterval: { type: String, enum: ['monthly', 'annual'] },
    mrr: { type: Number, default: 0 },

    limits: {
      seats: { type: Number, default: 5 },
      storageBytes: { type: Number, default: 5 * 1024 * 1024 * 1024 },   // 5GB
      projects: { type: Number, default: 10 },
      clients: { type: Number, default: 20 },
      automations: { type: Number, default: 10 },
    },

    usage: {
      seats: { type: Number, default: 0 },
      storageUsedBytes: { type: Number, default: 0 },
      projects: { type: Number, default: 0 },
      clients: { type: Number, default: 0 },
    },

    features: {
      contractModule: { type: Boolean, default: true },
      invoiceModule: { type: Boolean, default: true },
      automationsModule: { type: Boolean, default: false },
      analyticsModule: { type: Boolean, default: true },
      apiAccess: { type: Boolean, default: false },
      whiteLabel: { type: Boolean, default: false },
      customDomain: { type: Boolean, default: false },
      ssoEnabled: { type: Boolean, default: false },
    },

    onboarding: {
      completedSteps: [String],
      currentStep: { type: String, default: 'profile' },
      completedAt: Date,
    },

    ownerEmail: { type: String, required: true },
    contactPhone: String,
    address: {
      line1: String,
      city: String,
      country: String,
      postalCode: String,
    },

    registrationIp: String,
    registrationUserAgent: String,
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────
OrganizationSchema.index({ slug: 1 }, { unique: true });
OrganizationSchema.index({ status: 1 });
OrganizationSchema.index({ status: 1, plan: 1 });
OrganizationSchema.index({ trialEndsAt: 1 }, { sparse: true });    // cron: trial expiry
OrganizationSchema.index({ expiresAt: 1 }, { sparse: true });       // cron: sub expiry
OrganizationSchema.index({ stripeCustomerId: 1 }, { sparse: true });
OrganizationSchema.index({ ownerEmail: 1 });
OrganizationSchema.index({ createdAt: -1 });                        // platform admin listing
OrganizationSchema.index({ 'usage.storageUsedBytes': -1 });         // storage monitoring

// ── Plan limits helper ─────────────────────────────────────────────────
OrganizationSchema.statics.getDefaultLimits = function(plan: OrgPlan) {
  const limits = {
    TRIAL:      { seats: 3,   storageBytes: 1*1024**3,    projects: 3,  clients: 5,  automations: 3  },
    STARTER:    { seats: 10,  storageBytes: 10*1024**3,   projects: 20, clients: 50, automations: 10 },
    GROWTH:     { seats: 50,  storageBytes: 100*1024**3,  projects: -1, clients: -1, automations: 50 },
    ENTERPRISE: { seats: -1,  storageBytes: 1000*1024**3, projects: -1, clients: -1, automations: -1 },
  };
  return limits[plan];
};

export const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);
```

### 2.2 Modifications to Every Existing Model

Every entity must gain `organizationId` as a **required, indexed field**. Below is the exact change specification for each model:

#### User Model Changes
```typescript
// ADD to User schema:
organizationId: {
  type: Schema.Types.ObjectId,
  ref: 'Organization',
  required: true,
  index: true,
},
orgRole: {
  type: String,
  enum: ['ORGANIZATION_OWNER','ORGANIZATION_ADMIN','PROJECT_MANAGER','CONTRIBUTOR','CLIENT'],
  required: true,
},

// REMOVE: role field (replaced by orgRole for org-scoped users)
// Platform users are a separate model (PlatformUser)

// ADD compound indexes:
UserSchema.index({ organizationId: 1, email: 1 }, { unique: true }); // email unique per org
UserSchema.index({ organizationId: 1, orgRole: 1 });
UserSchema.index({ organizationId: 1, isActive: 1 });
UserSchema.index({ organizationId: 1, clientId: 1 }, { sparse: true });
// REMOVE: UserSchema.index({ email: 1 }, { unique: true }) 
// Email is now unique per org, not globally
// But keep a global sparse unique for platform-level lookup (optional):
UserSchema.index({ email: 1, organizationId: 1 }, { unique: true });
```

#### Project Model Changes
```typescript
organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true }
// Compound indexes:
ProjectSchema.index({ organizationId: 1, status: 1 });
ProjectSchema.index({ organizationId: 1, clientId: 1 });
ProjectSchema.index({ organizationId: 1, pm: 1 });
ProjectSchema.index({ organizationId: 1, slug: 1 }, { unique: true }); // slug unique per org
// REMOVE: slug unique: true (was global)
```

#### Task Model Changes
```typescript
organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true }
TaskSchema.index({ organizationId: 1, projectId: 1, status: 1 });
TaskSchema.index({ organizationId: 1, projectId: 1, assignees: 1 });
```

#### Client Model Changes
```typescript
organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true }
// slug unique per org, not globally:
ClientSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
ClientSchema.index({ organizationId: 1, status: 1 });
ClientSchema.index({ organizationId: 1, email: 1 });
// REMOVE: slug: { unique: true }
```

#### Invoice Model Changes
```typescript
organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true }
// invoiceNumber unique per org:
InvoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ organizationId: 1, status: 1 });
InvoiceSchema.index({ organizationId: 1, clientId: 1 });
InvoiceSchema.index({ organizationId: 1, dueDate: 1 }); // for overdue cron
// REMOVE: invoiceNumber: { unique: true }
```

#### Contract, ContractTemplate Model Changes
```typescript
organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true }
ContractSchema.index({ organizationId: 1, status: 1 });
ContractSchema.index({ organizationId: 1, clientId: 1 });
ContractTemplateSchema.index({ organizationId: 1, isDefault: 1 });
```

#### File Model Changes
```typescript
organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true }
FileSchema.index({ organizationId: 1, projectId: 1 });
FileSchema.index({ organizationId: 1, clientId: 1 });
FileSchema.index({ organizationId: 1, scanStatus: 1 });
```

#### Message, Channel Model Changes
```typescript
organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true }
MessageSchema.index({ organizationId: 1, channelId: 1, createdAt: -1 });
ChannelSchema.index({ organizationId: 1, projectId: 1 });
// text index must also be org-filtered at query time
```

#### Notification Model Changes
```typescript
organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true }
NotificationSchema.index({ organizationId: 1, userId: 1, isRead: 1 });
NotificationSchema.index({ organizationId: 1, createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90d TTL
```

#### AutomationRule Model Changes
```typescript
organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true }
AutomationRuleSchema.index({ organizationId: 1, isActive: 1, 'trigger.event': 1 });
```

#### AuditLog Model Changes
```typescript
organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true }
// null organizationId = platform-level audit (use sparse index)
AuditLogSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, resource: 1, resourceId: 1 });
// Add platform audit log variant:
isPlatformAction: { type: Boolean, default: false }
AuditLogSchema.index({ isPlatformAction: 1, createdAt: -1 });
```

#### Approval, Brief Model Changes
```typescript
organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true }
ApprovalSchema.index({ organizationId: 1, projectId: 1, status: 1 });
BriefSchema.index({ organizationId: 1, projectId: 1 }, { unique: true });
```

### 2.3 Tenant Isolation Middleware

Create `src/middleware/tenantScope.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { Organization } from '../models/Organization';
import { AuthorizationError, NotFoundError } from '../lib/errors';
import { cacheGet, cacheSet } from '../config/redis';

/**
 * tenantScope() — Must run AFTER authenticate()
 *
 * 1. Reads organizationId from req.user (set by authenticate)
 * 2. Validates the organization exists and is ACTIVE
 * 3. Attaches org to req.organization
 * 4. Sets req.tenantFilter = { organizationId } for all queries
 *
 * Platform users (req.user.isPlatformUser) bypass this middleware.
 */
export async function tenantScope(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AuthorizationError('Authentication required');

    // Platform users bypass tenant scoping
    if (req.user.isPlatformUser) return next();

    const orgId = req.user.organizationId;
    if (!orgId) throw new AuthorizationError('No organization context');

    // Check org cache first
    const cacheKey = `org:${orgId}:meta`;
    const cached = await cacheGet(cacheKey);

    let org;
    if (cached) {
      org = JSON.parse(cached);
    } else {
      org = await Organization.findById(orgId).lean();
      if (org) await cacheSet(cacheKey, JSON.stringify(org), 300); // 5-min TTL
    }

    if (!org) throw new NotFoundError('Organization not found');

    // Enforce organization status
    if (org.status === 'SUSPENDED') {
      throw new AuthorizationError('Your organization has been suspended. Contact support.');
    }
    if (org.status === 'EXPIRED_TRIAL') {
      throw new AuthorizationError('Your trial has expired. Please subscribe to continue.');
    }
    if (org.status === 'ARCHIVED') {
      throw new AuthorizationError('This organization has been archived.');
    }
    if (!['ACTIVE', 'APPROVED'].includes(org.status)) {
      throw new AuthorizationError('Organization is not yet active.');
    }

    req.organization = org;
    req.tenantFilter = { organizationId: org._id };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * assertSameOrg(resourceOrgId) — inline guard inside service functions
 * Throws if a resource's organizationId doesn't match the requester's org
 */
export function assertSameOrg(resourceOrgId: string, requestingOrgId: string): void {
  if (String(resourceOrgId) !== String(requestingOrgId)) {
    throw new AuthorizationError('Cross-tenant access denied');
  }
}
```

### 2.4 Updated `authenticate.ts` — Org Context in JWT

The existing `authenticate.ts` must be updated to attach `organizationId` and `orgRole` from the JWT payload:

```typescript
// CURRENT req.user shape:
{ id, email, role, clientId, sessionId, name }

// NEW req.user shape:
{
  id: string;
  email: string;
  orgRole: OrgRole;              // organization-scoped role
  organizationId: string;        // the tenant
  clientId?: string;
  sessionId: string;
  name: string;
  isPlatformUser: false;
  orgFeatures: Record<string, boolean>; // org feature flags (cached from org doc)
}

// Platform user shape (for PLATFORM_* roles):
{
  id: string;
  email: string;
  platformRole: PlatformRole;    // PLATFORM_OWNER | PLATFORM_ADMIN | PLATFORM_SUPPORT
  sessionId: string;
  name: string;
  isPlatformUser: true;
  impersonating?: {              // if impersonating an org admin
    organizationId: string;
    originalPlatformUserId: string;
  };
}
```

Changes to `authenticate.ts`:
```typescript
// After verifying JWT and loading user from DB or cache:
const user = await User.findById(decoded.sub).lean();

req.user = {
  id: user._id.toString(),
  email: user.email,
  orgRole: user.orgRole,
  organizationId: user.organizationId.toString(),
  clientId: user.clientId?.toString(),
  sessionId: decoded.sessionId,
  name: user.name,
  isPlatformUser: false,
  orgFeatures: user.orgFeatures ?? {}, // populated from org cache
};

// For platform users (separate PlatformUser model lookup):
// decoded.type === 'platform' → lookup PlatformUser, set isPlatformUser: true
```

### 2.5 Updated `authorize.ts` — Org-Scoped Permissions

```typescript
// NEW permission system: org-role-based

export type OrgRole =
  | 'ORGANIZATION_OWNER'
  | 'ORGANIZATION_ADMIN'
  | 'PROJECT_MANAGER'
  | 'CONTRIBUTOR'
  | 'CLIENT';

export type PlatformRole =
  | 'PLATFORM_OWNER'
  | 'PLATFORM_ADMIN'
  | 'PLATFORM_SUPPORT';

export const ORG_ROLE_PERMISSIONS: Record<OrgRole, string[]> = {
  ORGANIZATION_OWNER: [
    'clients:read', 'clients:write',
    'projects:read', 'projects:write',
    'tasks:read', 'tasks:write',
    'files:read', 'files:write',
    'messages:read', 'messages:write',
    'invoices:read', 'invoices:write',
    'contracts:read', 'contracts:write',
    'team:read', 'team:write',
    'analytics:read', 'analytics:write',
    'automations:read', 'automations:write',
    'admin:read', 'admin:write',
    'approvals:read', 'approvals:write',
    'billing:read', 'billing:write',
    'settings:read', 'settings:write',
    'org:delete',
  ],
  ORGANIZATION_ADMIN: [
    'clients:read', 'clients:write',
    'projects:read', 'projects:write',
    'tasks:read', 'tasks:write',
    'files:read', 'files:write',
    'messages:read', 'messages:write',
    'invoices:read', 'invoices:write',
    'contracts:read', 'contracts:write',
    'team:read', 'team:write',
    'analytics:read', 'analytics:write',
    'automations:read', 'automations:write',
    'admin:read', 'admin:write',
    'approvals:read', 'approvals:write',
    'billing:read',
    'settings:read', 'settings:write',
  ],
  PROJECT_MANAGER: [
    'clients:read',
    'projects:read', 'projects:write',
    'tasks:read', 'tasks:write',
    'files:read', 'files:write',
    'messages:read', 'messages:write',
    'invoices:read',
    'contracts:read',
    'analytics:read',
    'approvals:read', 'approvals:write',
    'team:read',
  ],
  CONTRIBUTOR: [
    'projects:read',
    'tasks:read', 'tasks:write',
    'files:read', 'files:write',
    'messages:read', 'messages:write',
    'approvals:read',
  ],
  CLIENT: [
    'projects:read',
    'tasks:read',
    'files:read',
    'messages:read', 'messages:write',
    'invoices:read',
    'contracts:read',
    'approvals:read', 'approvals:write',
  ],
};

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, string[]> = {
  PLATFORM_OWNER: ['platform:*', 'orgs:read', 'orgs:write', 'orgs:delete',
                   'billing:read', 'billing:write', 'impersonate', 'feature-flags:write',
                   'platform-users:read', 'platform-users:write'],
  PLATFORM_ADMIN: ['orgs:read', 'orgs:write', 'billing:read', 'impersonate',
                   'feature-flags:read', 'platform-users:read'],
  PLATFORM_SUPPORT: ['orgs:read', 'billing:read', 'impersonate:readonly'],
};

// Guard factory — replaces old authorize()
export function authorize(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(new AuthorizationError('Not authenticated'));

    let userPermissions: string[];

    if (user.isPlatformUser) {
      userPermissions = PLATFORM_ROLE_PERMISSIONS[user.platformRole] ?? [];
      // PLATFORM_OWNER has wildcard
      if (userPermissions.includes('platform:*')) return next();
    } else {
      userPermissions = ORG_ROLE_PERMISSIONS[user.orgRole] ?? [];
    }

    const hasAll = permissions.every(p => userPermissions.includes(p));
    if (!hasAll) return next(new AuthorizationError('Insufficient permissions'));

    next();
  };
}

// Feature flag guard — checks org features before allowing access
export function requireFeature(featureKey: keyof IOrganization['features']) {
  return (req: Request, res: Response, next: NextFunction) => {
    const org = req.organization;
    if (!org) return next(new AuthorizationError('No organization context'));
    if (!org.features[featureKey]) {
      return next(new AuthorizationError(`Feature '${featureKey}' is not enabled for your plan`));
    }
    next();
  };
}
```

### 2.6 Service Layer — Tenant-Scoped Queries

Every service function must now accept `organizationId` and prepend it to all queries. Example transformation:

**BEFORE (single-tenant):**
```typescript
// projects.service.ts
async function getProjects(userId: string, role: string) {
  let filter: FilterQuery<IProject> = {};
  if (role === 'CLIENT') filter.clientId = user.clientId;
  if (role === 'CONTRIBUTOR') filter.contributors = userId;
  return Project.find(filter).populate('pm clientId').lean();
}
```

**AFTER (multi-tenant):**
```typescript
// projects.service.ts
async function getProjects(
  userId: string,
  orgRole: OrgRole,
  organizationId: string,
  clientId?: string,
  options?: { page?: number; limit?: number }
) {
  // organizationId is ALWAYS the first filter condition — never optional
  const base: FilterQuery<IProject> = { organizationId };

  if (orgRole === 'CLIENT') {
    base.clientId = clientId;
  } else if (orgRole === 'CONTRIBUTOR') {
    base.contributors = userId;
  } else if (orgRole === 'PROJECT_MANAGER') {
    base.$or = [{ pm: userId }, { contributors: userId }];
  }
  // ORGANIZATION_OWNER and ORGANIZATION_ADMIN see all org projects (base filter only)

  const page = options?.page ?? 1;
  const limit = options?.limit ?? 20;

  return Project.find(base)
    .populate('pm', 'name avatar')
    .populate('clientId', 'companyName slug')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
}
```

This pattern must be applied to **every** `find`, `findOne`, `findById`, `updateOne`, `deleteOne`, `countDocuments`, `aggregate` call in all 13 service files. The `organizationId` filter must be position 0 in every query — this ensures MongoDB uses the compound index `{ organizationId: 1, ... }` and never scans across tenants.

### 2.7 Query Optimization — Index Strategy

```
Collection        Compound Index (Left-to-Right)           Purpose
─────────────────────────────────────────────────────────────────────
User              { organizationId, email }                 Unique per-org login
User              { organizationId, orgRole, isActive }     Team listing
Project           { organizationId, status, createdAt }     Dashboard listing
Project           { organizationId, clientId }              Client's projects
Task              { organizationId, projectId, status }     Kanban board
Task              { organizationId, projectId, assignees }  My tasks
Invoice           { organizationId, status, dueDate }       Overdue cron
Invoice           { organizationId, clientId }              Client invoices
File              { organizationId, projectId, folder }     File browser
Message           { organizationId, channelId, createdAt }  Chat history
Notification      { organizationId, userId, isRead }        Notification bell
AutomationRule    { organizationId, isActive, trigger.event } Rule engine
AuditLog          { organizationId, resource, createdAt }   Admin audit trail
Organization      { status, plan }                          Platform dashboard
Organization      { trialEndsAt }                           Trial expiry cron
```

**Critical MongoDB optimization rule:** The `organizationId` field MUST be the leftmost field in every compound index. This ensures the index is used even when only `organizationId` is supplied as a filter. Never create an index that doesn't start with `organizationId` for org-scoped collections.

### 2.8 Tenant-Aware Caching

All Redis cache keys must be org-namespaced. Full specification in Section 10.

### 2.9 Tenant-Aware WebSocket Rooms

Full specification in Section 9.

### 2.10 Express.d.ts Type Augmentation Updates

```typescript
// src/types/express.d.ts — REPLACE entirely

import { IOrganization } from '../models/Organization';

declare global {
  namespace Express {
    interface User {
      // Org user
      id: string;
      email: string;
      orgRole: import('../middleware/authorize').OrgRole;
      organizationId: string;
      clientId?: string;
      sessionId: string;
      name: string;
      isPlatformUser: false;
    }

    interface PlatformUser {
      id: string;
      email: string;
      platformRole: import('../middleware/authorize').PlatformRole;
      sessionId: string;
      name: string;
      isPlatformUser: true;
      impersonating?: {
        organizationId: string;
        originalPlatformUserId: string;
        grantedAt: Date;
      };
    }

    interface Request {
      user?: User | PlatformUser;
      organization?: IOrganization;
      tenantFilter?: { organizationId: string };
      requestId?: string;
    }
  }
}
```

---

## 3. Platform-Level Admin System

### 3.1 Architecture Overview

The Platform Admin System is a **completely separate authentication domain** from org users. It operates at the infrastructure level above all tenants. It has its own:
- User model (`PlatformUser`)
- JWT secrets (`PLATFORM_JWT_ACCESS_SECRET`, `PLATFORM_JWT_REFRESH_SECRET`)
- Route prefix (`/api/platform/`)
- Middleware chain (`authenticatePlatform`, `authorizePlatform`)
- Audit log trail (`isPlatformAction: true`)
- Redis namespace (`platform:*`)

```
Platform Admin Architecture:
─────────────────────────────────────────────────────
/api/platform/*
    │
    ├── authenticatePlatform()   ← reads platform-specific JWT
    │     └── verifies PLATFORM_JWT_ACCESS_SECRET
    │         checks platform:revoked:session:{sessionId}
    │         loads PlatformUser from platform:user:{id} cache
    │
    ├── authorizePlatform(...perms)   ← PLATFORM_ROLE_PERMISSIONS
    │
    └── Route handlers in src/modules/platform/
          ├── organizations/    ← view/approve/suspend/manage orgs
          ├── billing/          ← subscription management
          ├── analytics/        ← platform-wide metrics
          ├── users/            ← platform user management
          ├── flags/            ← feature flag management
          └── impersonation/    ← impersonate org admins
```

### 3.2 PlatformUser Model

Create `src/models/PlatformUser.ts`:

```typescript
import mongoose, { Document, Schema } from 'mongoose';

export type PlatformRole = 'PLATFORM_OWNER' | 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT';

export interface IPlatformUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  avatar?: string;
  platformRole: PlatformRole;
  isActive: boolean;
  lastLoginAt?: Date;
  mfaEnabled: boolean;
  mfaSecret?: string;         // TOTP secret (encrypted at rest)
  devices: Array<{
    deviceId: string;
    userAgent: string;
    lastSeenAt: Date;
    ipAddress: string;
  }>;
  // Audit
  createdBy?: mongoose.Types.ObjectId;
  loginHistory: Array<{
    ip: string;
    userAgent: string;
    at: Date;
    success: boolean;
  }>;
}

const PlatformUserSchema = new Schema<IPlatformUser>({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, required: true },
  avatar: String,
  platformRole: {
    type: String,
    enum: ['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_SUPPORT'],
    required: true,
  },
  isActive: { type: Boolean, default: true },
  lastLoginAt: Date,
  mfaEnabled: { type: Boolean, default: false },
  mfaSecret: { type: String, select: false },
  devices: [{
    deviceId: String,
    userAgent: String,
    lastSeenAt: Date,
    ipAddress: String,
  }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'PlatformUser', sparse: true },
  loginHistory: [{
    ip: String,
    userAgent: String,
    at: Date,
    success: Boolean,
  }],
}, { timestamps: true });

PlatformUserSchema.index({ platformRole: 1 });
PlatformUserSchema.index({ isActive: 1 });

export const PlatformUser = mongoose.model<IPlatformUser>('PlatformUser', PlatformUserSchema);
```

### 3.3 Platform Authentication Middleware

Create `src/middleware/authenticatePlatform.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyPlatformAccessToken } from '../lib/platformJwt';
import { cacheGet } from '../config/redis';
import { PlatformUser } from '../models/PlatformUser';
import { AuthenticationError } from '../lib/errors';

export async function authenticatePlatform(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new AuthenticationError('Platform token required');

    const token = authHeader.slice(7);
    const decoded = verifyPlatformAccessToken(token);  // uses PLATFORM_JWT_ACCESS_SECRET

    // Check revocation list
    const isRevoked = await cacheGet(`platform:revoked:session:${decoded.sessionId}`);
    if (isRevoked) throw new AuthenticationError('Session revoked');

    // Load platform user from cache or DB
    const cacheKey = `platform:user:${decoded.sub}`;
    let platformUser = await cacheGet(cacheKey).then(v => v ? JSON.parse(v) : null);
    if (!platformUser) {
      platformUser = await PlatformUser.findById(decoded.sub).lean();
      if (platformUser) {
        // Cache for 5 minutes
        await cacheSet(cacheKey, JSON.stringify(platformUser), 300);
      }
    }

    if (!platformUser || !platformUser.isActive) {
      throw new AuthenticationError('Platform user not found or deactivated');
    }

    req.user = {
      id: platformUser._id.toString(),
      email: platformUser.email,
      platformRole: platformUser.platformRole,
      sessionId: decoded.sessionId,
      name: platformUser.name,
      isPlatformUser: true,
      impersonating: decoded.impersonating,
    };

    next();
  } catch (err) {
    next(err);
  }
}
```

Create `src/lib/platformJwt.ts`:
```typescript
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticationError } from './errors';

export interface PlatformAccessTokenPayload {
  sub: string;             // PlatformUser._id
  platformRole: PlatformRole;
  sessionId: string;
  type: 'platform_access';
  impersonating?: {
    organizationId: string;
    originalPlatformUserId: string;
    grantedAt: number;     // Unix timestamp
  };
}

export function signPlatformAccessToken(payload: Omit<PlatformAccessTokenPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'platform_access' },
    env.PLATFORM_JWT_ACCESS_SECRET,
    { expiresIn: '15m', issuer: 'agencyos-platform' }
  );
}

export function verifyPlatformAccessToken(token: string): PlatformAccessTokenPayload {
  try {
    return jwt.verify(token, env.PLATFORM_JWT_ACCESS_SECRET, {
      issuer: 'agencyos-platform',
    }) as PlatformAccessTokenPayload;
  } catch {
    throw new AuthenticationError('Invalid platform token');
  }
}
```

### 3.4 Platform Routes — Full API Specification

Create `src/modules/platform/` directory with the following route structure:

```
/api/platform/auth
  POST /login                    Platform user login
  POST /refresh                  Rotate platform refresh token
  POST /logout                   Revoke platform session
  POST /mfa/setup                Generate TOTP QR code
  POST /mfa/verify               Verify TOTP code

/api/platform/organizations
  GET  /                         List all organizations (paginated, filterable)
  GET  /pending                  List orgs with status=PENDING_APPROVAL
  GET  /:id                      Get organization detail
  GET  /:id/users                List org users
  GET  /:id/analytics            Org-level analytics
  GET  /:id/audit-logs           Org audit trail
  GET  /:id/storage              Storage usage breakdown
  GET  /:id/billing              Billing history + current plan
  POST /:id/approve              Approve organization (→ ACTIVE + trial start)
  POST /:id/reject               Reject organization (reason required)
  POST /:id/suspend              Suspend organization
  POST /:id/reactivate           Reactivate suspended org
  POST /:id/archive              Archive organization
  PATCH /:id/plan                Change subscription plan
  PATCH /:id/limits              Override plan limits
  PATCH /:id/features            Toggle feature flags
  PATCH /:id/trial               Extend trial period
  DELETE /:id                    Hard delete (PLATFORM_OWNER only)

/api/platform/impersonation
  POST /start                    Start impersonating an org admin
  POST /stop                     Stop impersonating (return to platform context)
  GET  /active                   Get current impersonation session

/api/platform/analytics
  GET  /overview                 Platform dashboard: MRR, orgs, churn, etc.
  GET  /mrr                      MRR trend over time
  GET  /organizations            Org activity ranking
  GET  /onboarding-funnel        Registration→Trial→Active conversion funnel
  GET  /storage                  Global storage usage
  GET  /api-usage                API request volume by org

/api/platform/users
  GET  /                         List platform users
  POST /                         Create platform user (PLATFORM_OWNER only)
  PATCH /:id/role                Change platform role
  PATCH /:id/deactivate          Deactivate platform user

/api/platform/flags
  GET  /                         List all feature flags
  PATCH /:flagKey                Toggle global feature flag

/api/platform/billing
  GET  /subscriptions            All Stripe subscriptions
  GET  /mrr-breakdown            MRR by plan tier
  POST /orgs/:id/grant-credits   Apply Stripe credits to org
```

### 3.5 Impersonation System — Security Design

Impersonation allows a Platform Admin to act as an `ORGANIZATION_ADMIN` within a specific org for support purposes. It is:
- **Time-limited**: sessions expire after 1 hour
- **Audit-logged**: every impersonated action is logged with both the original platform user ID and the target org
- **Read-only option**: `PLATFORM_SUPPORT` can only impersonate in read-only mode
- **Revocable**: platform admins can terminate impersonation sessions from the platform dashboard

```typescript
// src/modules/platform/impersonation/impersonation.service.ts

async function startImpersonation(
  platformUserId: string,
  platformRole: PlatformRole,
  targetOrgId: string,
  targetOrgAdminId: string
) {
  // 1. Validate platform user has impersonate permission
  const canImpersonate = PLATFORM_ROLE_PERMISSIONS[platformRole].includes('impersonate');
  if (!canImpersonate) throw new AuthorizationError('Cannot impersonate');

  // 2. Validate target org exists and is not ARCHIVED
  const org = await Organization.findById(targetOrgId).lean();
  if (!org || org.status === 'ARCHIVED') throw new NotFoundError('Organization not available');

  // 3. Create impersonation token — scoped to org, expires in 1 hour
  const impersonationSessionId = generateSecureToken(16);
  const impersonationPayload: PlatformAccessTokenPayload = {
    sub: platformUserId,
    platformRole,
    sessionId: impersonationSessionId,
    type: 'platform_access',
    impersonating: {
      organizationId: targetOrgId,
      originalPlatformUserId: platformUserId,
      grantedAt: Date.now(),
    },
  };

  const accessToken = signPlatformAccessToken(impersonationPayload);

  // 4. Store impersonation session in Redis (1 hour TTL)
  await cacheSet(
    `platform:impersonation:${impersonationSessionId}`,
    JSON.stringify({ platformUserId, targetOrgId, targetOrgAdminId, startedAt: new Date() }),
    3600
  );

  // 5. Audit log — immutable record
  await AuditLog.create({
    userId: platformUserId,
    action: 'IMPERSONATION_STARTED',
    resource: 'Organization',
    resourceId: targetOrgId,
    isPlatformAction: true,
    metadata: { targetOrgAdminId, platformRole },
  });

  return { accessToken, expiresIn: 3600, targetOrg: org.name };
}

async function stopImpersonation(impersonationSessionId: string, platformUserId: string) {
  await cacheSet(`platform:revoked:session:${impersonationSessionId}`, '1', 86400);
  await cacheSet(`platform:impersonation:${impersonationSessionId}`, null, 0); // delete
  await AuditLog.create({
    userId: platformUserId,
    action: 'IMPERSONATION_ENDED',
    isPlatformAction: true,
    metadata: { sessionId: impersonationSessionId },
  });
}
```

**Impersonation security rules enforced in middleware:**
1. Impersonated tokens cannot call `/api/platform/*` routes (except `/stop`)
2. Impersonated tokens are scoped to a single `organizationId` — `tenantScope` validates this
3. Actions taken under impersonation are tagged with `impersonatedBy: platformUserId` in audit logs
4. Impersonation sessions are logged in a tamper-proof audit trail
5. Any `billing:write` actions are blocked during impersonation

---

## 4. Organization Registration & Approval Flow

### 4.1 Registration API

Create `src/modules/organizations/` module:

```
/api/v1/organizations
  POST /register          Public: register a new organization
  GET  /verify-slug       Public: check slug availability
  GET  /status/:slug      Public: check org registration status (for pending page)

  GET  /                  Auth (ORGANIZATION_OWNER): get own org detail
  PATCH /                 Auth (ORGANIZATION_OWNER): update org profile
  GET  /billing           Auth (ORGANIZATION_OWNER/ADMIN): billing info
  POST /billing/portal    Auth (ORGANIZATION_OWNER): Stripe billing portal
  GET  /usage             Auth: current usage vs limits
  POST /invite-user       Auth (ORGANIZATION_OWNER/ADMIN): invite team member
  DELETE /                Auth (ORGANIZATION_OWNER): request org deletion
```

### 4.2 Registration Schema (Zod Validation)

```typescript
// src/modules/organizations/organizations.schemas.ts

import { z } from 'zod';

export const RegisterOrganizationSchema = z.object({
  body: z.object({
    // Organization fields
    orgName: z.string().min(2).max(100).trim(),
    orgSlug: z.string()
      .min(3).max(50)
      .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug must be lowercase alphanumeric with hyphens')
      .optional(),  // auto-generated if not provided

    // First user (becomes ORGANIZATION_OWNER)
    ownerName: z.string().min(2).max(100).trim(),
    ownerEmail: z.string().email().toLowerCase(),
    ownerPassword: z.string()
      .min(10)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, 
             'Password must contain uppercase, lowercase, number, and special character'),

    // Optional org info
    contactPhone: z.string().optional(),
    website: z.string().url().optional(),
    address: z.object({
      line1: z.string(),
      city: z.string(),
      country: z.string().length(2),  // ISO 3166-1 alpha-2
      postalCode: z.string(),
    }).optional(),

    // Terms acceptance
    acceptedTermsAt: z.string().datetime(),   // ISO timestamp of terms acceptance
    acceptedPrivacyAt: z.string().datetime(),
    referralSource: z.string().max(100).optional(),   // "how did you hear about us"
  })
});
```

### 4.3 Registration Service — Complete Flow

```typescript
// src/modules/organizations/organizations.service.ts

async function registerOrganization(
  data: z.infer<typeof RegisterOrganizationSchema>['body'],
  ip: string,
  userAgent: string,
) {
  // ── 1. Rate limiting check (additional service-level) ─────────────────
  const registrationRateKey = `rate:org-register:${ip}`;
  const attempts = await cacheGet(registrationRateKey);
  if (parseInt(attempts ?? '0') >= 3) {
    throw new RateLimitError('Too many registration attempts from this IP');
  }
  await redis.incr(registrationRateKey);
  await redis.expire(registrationRateKey, 3600); // 1 hour window

  // ── 2. Check email not already used as org owner ──────────────────────
  const existingUser = await User.findOne({ email: data.ownerEmail }).lean();
  if (existingUser) {
    // Prevent org enumeration — return same message regardless
    throw new ConflictError('An account with this email already exists');
  }

  // ── 3. Generate and validate slug ────────────────────────────────────
  let slug = data.orgSlug ?? generateSlug(data.orgName);
  const slugTaken = await Organization.findOne({ slug }).lean();
  if (slugTaken) {
    slug = `${slug}-${generateSecureToken(2)}`; // auto-disambiguate
  }

  // ── 4. Create Organization (status: PENDING_APPROVAL) ─────────────────
  const org = await Organization.create({
    name: data.orgName,
    slug,
    status: 'PENDING_APPROVAL',
    plan: 'TRIAL',
    ownerEmail: data.ownerEmail,
    contactPhone: data.contactPhone,
    address: data.address,
    registrationIp: ip,
    registrationUserAgent: userAgent,
    registeredAt: new Date(),
    approvalSubmittedAt: new Date(),
    limits: Organization.getDefaultLimits('TRIAL'),
    metadata: {
      referralSource: data.referralSource,
      acceptedTermsAt: data.acceptedTermsAt,
      acceptedPrivacyAt: data.acceptedPrivacyAt,
    },
  });

  // ── 5. Create ORGANIZATION_OWNER user ─────────────────────────────────
  const passwordHash = await argon2.hash(data.ownerPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64MB
    timeCost: 3,
    parallelism: 4,
  });

  const owner = await User.create({
    email: data.ownerEmail,
    passwordHash,
    name: data.ownerName,
    organizationId: org._id,
    orgRole: 'ORGANIZATION_OWNER',
    isActive: false,  // Inactive until org is APPROVED
  });

  // Update org usage
  await Organization.updateOne({ _id: org._id }, { $inc: { 'usage.seats': 1 } });

  // ── 6. Enqueue lifecycle emails ───────────────────────────────────────
  // Email to registrant: "Registration received"
  await enqueueEmail({
    type: 'org:registration-received',
    to: data.ownerEmail,
    data: {
      ownerName: data.ownerName,
      orgName: data.orgName,
      slug,
      estimatedReviewTime: '24-48 hours',
    },
  });

  // Email to platform admins: "New org pending review"
  await enqueueEmail({
    type: 'platform:new-org-pending',
    data: { orgId: org._id.toString(), orgName: data.orgName, ownerEmail: data.ownerEmail },
  });

  // ── 7. Audit log ─────────────────────────────────────────────────────
  await AuditLog.create({
    organizationId: org._id,
    userId: owner._id,
    action: 'ORGANIZATION_REGISTERED',
    resource: 'Organization',
    resourceId: org._id,
    isPlatformAction: false,
    ip,
    metadata: { slug, ownerEmail: data.ownerEmail },
  });

  return {
    organizationId: org._id,
    slug,
    status: 'PENDING_APPROVAL',
    message: 'Registration submitted. You will receive an email within 24-48 hours.',
  };
}
```

### 4.4 Approval Workflow — Platform Side

```typescript
// src/modules/platform/organizations/platformOrganizations.service.ts

async function approveOrganization(
  orgId: string,
  platformUserId: string,
  options: {
    notes?: string;
    trialDays?: number;       // default: 14
    plan?: OrgPlan;           // default: TRIAL
    customLimits?: Partial<IOrganization['limits']>;
  }
) {
  const org = await Organization.findById(orgId);
  if (!org) throw new NotFoundError('Organization not found');
  if (org.status !== 'PENDING_APPROVAL') {
    throw new ConflictError(`Cannot approve organization in status: ${org.status}`);
  }

  const trialDays = options.trialDays ?? 14;
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

  // Transition: PENDING_APPROVAL → ACTIVE (on trial)
  await Organization.updateOne({ _id: orgId }, {
    status: 'ACTIVE',
    plan: options.plan ?? 'TRIAL',
    approvedAt: now,
    trialStartsAt: now,
    trialEndsAt,
    expiresAt: trialEndsAt,
    approvalReviewedBy: platformUserId,
    approvalNotes: options.notes,
    ...(options.customLimits && { limits: { ...org.limits, ...options.customLimits } }),
  });

  // Activate the ORGANIZATION_OWNER user
  await User.updateOne(
    { organizationId: orgId, orgRole: 'ORGANIZATION_OWNER' },
    { isActive: true }
  );

  // Invalidate org cache
  await cacheDel(`org:${orgId}:meta`);

  // Enqueue onboarding email sequence
  await enqueueEmail({
    type: 'org:approved',
    to: org.ownerEmail,
    scheduledFor: now,
    data: { orgName: org.name, trialDays, loginUrl: `${env.FRONTEND_URL}/login` },
  });
  // Trial reminder at day 10 (4 days before expiry)
  await enqueueEmail({
    type: 'org:trial-expiring-soon',
    to: org.ownerEmail,
    scheduledFor: new Date(trialEndsAt.getTime() - 4 * 24 * 60 * 60 * 1000),
    data: { orgName: org.name, daysLeft: 4 },
  });

  // Platform audit
  await AuditLog.create({
    organizationId: orgId,
    userId: platformUserId,
    action: 'ORGANIZATION_APPROVED',
    resource: 'Organization',
    resourceId: orgId,
    isPlatformAction: true,
    metadata: { trialDays, plan: options.plan },
  });

  return { approved: true, trialEndsAt };
}

async function rejectOrganization(
  orgId: string,
  platformUserId: string,
  reason: string,
  internalNotes?: string,
) {
  const org = await Organization.findById(orgId);
  if (!org) throw new NotFoundError('Organization not found');
  if (!['PENDING_APPROVAL', 'APPROVED'].includes(org.status)) {
    throw new ConflictError('Organization cannot be rejected in current state');
  }

  const now = new Date();

  await Organization.updateOne({ _id: orgId }, {
    status: 'REJECTED',
    rejectedAt: now,
    rejectionReason: reason,
    approvalNotes: internalNotes,
    approvalReviewedBy: platformUserId,
  });

  // Keep user record but ensure isActive: false
  await User.updateMany({ organizationId: orgId }, { isActive: false });

  // Enqueue rejection email (with reason if appropriate)
  await enqueueEmail({
    type: 'org:rejected',
    to: org.ownerEmail,
    data: { orgName: org.name, reason },
  });

  await AuditLog.create({
    organizationId: orgId,
    userId: platformUserId,
    action: 'ORGANIZATION_REJECTED',
    resource: 'Organization',
    resourceId: orgId,
    isPlatformAction: true,
    metadata: { reason },
  });
}

async function suspendOrganization(
  orgId: string,
  platformUserId: string,
  reason: string,
) {
  const org = await Organization.findById(orgId);
  if (!org || !['ACTIVE', 'APPROVED'].includes(org.status)) {
    throw new ConflictError('Organization cannot be suspended in current state');
  }

  await Organization.updateOne({ _id: orgId }, {
    status: 'SUSPENDED',
    suspendedAt: new Date(),
    metadata: { ...org.metadata, suspensionReason: reason },
  });

  // Invalidate all active sessions for this org
  await invalidateOrgSessions(orgId);

  // Invalidate org cache
  await cacheDel(`org:${orgId}:meta`);

  // Disconnect all sockets in org room
  // This is handled by tenantScope() checking status on next request
  // Proactive disconnect via Socket.io:
  io.to(`organization:${orgId}`).emit('org:suspended', {
    message: 'Your organization has been suspended. Contact support.',
  });

  await enqueueEmail({
    type: 'org:suspended',
    to: org.ownerEmail,
    data: { orgName: org.name, reason, supportUrl: env.SUPPORT_URL },
  });

  await AuditLog.create({
    organizationId: orgId,
    userId: platformUserId,
    action: 'ORGANIZATION_SUSPENDED',
    isPlatformAction: true,
    metadata: { reason },
  });
}
```

### 4.5 Organization Status Lifecycle Diagram

```
                    ┌─────────────────┐
                    │   Registration   │
                    │   (public API)   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ PENDING_APPROVAL │◄─────────── Re-submit after rejection
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │ Platform     │ Platform     │
              │ approves     │ rejects      │
              ▼              ▼              │
         ┌────────┐    ┌──────────┐        │
         │ ACTIVE │    │ REJECTED │────────┘
         │(trial) │    └──────────┘
         └────┬───┘
              │
    ┌─────────┼───────────┐
    │         │           │
    │         ▼           │
    │  ┌────────────────┐ │
    │  │  EXPIRED_TRIAL │ │   (trial ends, no subscription)
    │  └────────────────┘ │
    │         │           │
    │         │ reactivate│ subscribe
    │         ▼           │
    │  ┌─────────┐        │
    │  │ ACTIVE  │◄───────┘   (on subscription)
    │  │(billing)│
    │  └────┬────┘
    │       │
    │   ┌───┴──────┐
    │   │ Platform │ suspends
    │   ▼          │
    │ ┌───────────┐│
    │ │ SUSPENDED ││
    │ └─────┬─────┘│
    │       │reactivate
    │       └──────┘
    │
    │  ┌──────────┐
    └─►│ ARCHIVED │   (hard-archived by platform, no recovery)
       └──────────┘
```

### 4.6 Abuse Prevention — Registration Hardening

```typescript
// Rate limiting on registration endpoint (rateLimiter.ts additions):
export const orgRegistrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 3,                      // max 3 org registrations per IP per hour
  keyGenerator: (req) => req.ip,
  message: 'Too many registration attempts. Try again in an hour.',
  standardHeaders: true,
  skip: () => env.NODE_ENV === 'test',
});

// Additional Zod validations in RegisterOrganizationSchema:
// - orgName: blocklist common spam names ('test', 'xxx', 'asdf')
// - ownerEmail: validate MX record (optional: use dns.promises.resolveMx)
// - Block disposable email domains (maintain blocklist)

// Registration honeypot field (for bot detection):
// Add optional `_gotcha` field to form — if it's populated, silently reject

// Domain uniqueness: if domain is provided, ensure not already registered
// This prevents one domain from having multiple orgs
```

---

## 5. First User = Organization Owner

### 5.1 ORGANIZATION_OWNER Bootstrap Logic

When `registerOrganization()` creates the first user, they receive `orgRole: 'ORGANIZATION_OWNER'`. This is the only path to becoming an owner — no API endpoint allows self-promotion. Ownership can only be transferred by the current owner.

```typescript
// Owner privileges within their org (enforced by RBAC, not special-cased):
// - All permissions in ORG_ROLE_PERMISSIONS.ORGANIZATION_OWNER
// - CANNOT access /api/platform/* (no platformRole)
// - CANNOT read/write another org's data (tenantScope enforces this)
// - CAN delete their own organization (org:delete permission)
// - CAN invite ORGANIZATION_ADMIN users (team:write)
// - CAN transfer ownership to another ORGANIZATION_ADMIN
```

### 5.2 Ownership Transfer

```typescript
// POST /api/v1/admin/transfer-ownership
// Auth: ORGANIZATION_OWNER only

async function transferOwnership(
  currentOwnerId: string,
  organizationId: string,
  newOwnerId: string,
  confirmPassword: string,  // must re-authenticate to confirm
) {
  // 1. Verify current owner's password
  const currentOwner = await User.findById(currentOwnerId).select('+passwordHash').lean();
  const passwordValid = await argon2.verify(currentOwner.passwordHash, confirmPassword);
  if (!passwordValid) throw new AuthenticationError('Password confirmation failed');

  // 2. Verify new owner is in same org and is ORGANIZATION_ADMIN
  const newOwner = await User.findOne({
    _id: newOwnerId,
    organizationId,
    orgRole: 'ORGANIZATION_ADMIN',
    isActive: true,
  }).lean();
  if (!newOwner) throw new ValidationError('Target user must be an active ORGANIZATION_ADMIN in your organization');

  // 3. Atomic swap in transaction
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    await User.updateOne(
      { _id: currentOwnerId },
      { orgRole: 'ORGANIZATION_ADMIN' },
      { session }
    );
    await User.updateOne(
      { _id: newOwnerId },
      { orgRole: 'ORGANIZATION_OWNER' },
      { session }
    );
    await Organization.updateOne(
      { _id: organizationId },
      { ownerEmail: newOwner.email },
      { session }
    );
  });
  await session.endSession();

  // 4. Invalidate both users' caches + org cache
  await cacheDel(`user:${currentOwnerId}`);
  await cacheDel(`user:${newOwnerId}`);
  await cacheDel(`org:${organizationId}:meta`);

  // 5. Audit + notification
  await AuditLog.create({
    organizationId,
    userId: currentOwnerId,
    action: 'OWNERSHIP_TRANSFERRED',
    resource: 'Organization',
    resourceId: organizationId,
    metadata: { from: currentOwnerId, to: newOwnerId },
  });

  await enqueueEmail({
    type: 'org:ownership-transferred',
    to: newOwner.email,
    data: { newOwnerName: newOwner.name, orgName: req.organization.name },
  });
}
```

### 5.3 Organization Deletion Safeguards

```typescript
// DELETE /api/v1/organizations (ORGANIZATION_OWNER only)
// This initiates a soft-deletion pipeline, NOT immediate hard delete

async function requestOrganizationDeletion(ownerId: string, orgId: string, reason?: string) {
  // 1. Cannot delete if active Stripe subscription exists
  const org = await Organization.findById(orgId).lean();
  if (org.stripeSubscriptionId) {
    throw new ConflictError(
      'Cancel your subscription before deleting the organization. ' +
      'Visit billing settings to cancel.'
    );
  }

  // 2. Cannot delete if outstanding unpaid invoices exist
  const unpaidInvoices = await Invoice.countDocuments({
    organizationId: orgId,
    status: { $in: ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'] },
  });
  if (unpaidInvoices > 0) {
    throw new ConflictError(`Cannot delete organization with ${unpaidInvoices} outstanding invoice(s)`);
  }

  // 3. Schedule deletion for 30 days in the future (grace period + legal hold)
  const deletionScheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await Organization.updateOne({ _id: orgId }, {
    status: 'ARCHIVED',
    archivedAt: new Date(),
    metadata: {
      ...org.metadata,
      deletionReason: reason,
      deletionScheduledFor,
      deletionRequestedBy: ownerId,
    },
  });

  // Deactivate all users
  await User.updateMany({ organizationId: orgId }, { isActive: false });

  // Invalidate all sessions
  await invalidateOrgSessions(orgId);

  // Email confirmation to owner
  await enqueueEmail({
    type: 'org:deletion-scheduled',
    to: org.ownerEmail,
    data: { orgName: org.name, deletionDate: deletionScheduledFor, cancelUrl: env.FRONTEND_URL },
  });

  // Alert platform admins
  await enqueueEmail({
    type: 'platform:org-deletion-requested',
    data: { orgId, orgName: org.name, ownerId, reason, deletionScheduledFor },
  });
}
```

---

## 6. New Enterprise RBAC Hierarchy

### 6.1 Complete Role Architecture

```
PLATFORM DOMAIN                    ORGANIZATION DOMAIN
─────────────────────────────────────────────────────────────
PLATFORM_OWNER                     (per organization)
  └── PLATFORM_ADMIN               ORGANIZATION_OWNER
        └── PLATFORM_SUPPORT            └── ORGANIZATION_ADMIN
                                              └── PROJECT_MANAGER
                                                    └── CONTRIBUTOR
                                                          └── CLIENT

Platform roles have NO visibility into org data (unless impersonating).
Org roles have NO visibility into other orgs.
Platform roles are stored in PlatformUser.platformRole.
Org roles are stored in User.orgRole.
```

### 6.2 Complete Permission Matrix

```
                        ORG_OWNER  ORG_ADMIN  PM   CONTRIB  CLIENT
─────────────────────────────────────────────────────────────────────
clients:read              ✅         ✅        ✅     —        —
clients:write             ✅         ✅        —      —        —
projects:read             ✅         ✅        ✅     ✅        ✅*
projects:write            ✅         ✅        ✅     —        —
tasks:read                ✅         ✅        ✅     ✅        ✅*
tasks:write               ✅         ✅        ✅     ✅        —
files:read                ✅         ✅        ✅     ✅        ✅†
files:write               ✅         ✅        ✅     ✅        —
messages:read             ✅         ✅        ✅     ✅        ✅
messages:write            ✅         ✅        ✅     ✅        ✅‡
invoices:read             ✅         ✅        ✅     —        ✅§
invoices:write            ✅         ✅        —      —        —
contracts:read            ✅         ✅        ✅     —        ✅§
contracts:write           ✅         ✅        —      —        —
team:read                 ✅         ✅        ✅     —        —
team:write                ✅         ✅        —      —        —
analytics:read            ✅         ✅        ✅     —        —
analytics:write           ✅         —         —      —        —
automations:read          ✅         ✅        —      —        —
automations:write         ✅         ✅        —      —        —
admin:read                ✅         ✅        —      —        —
admin:write               ✅         ✅        —      —        —
approvals:read            ✅         ✅        ✅     ✅        ✅
approvals:write           ✅         ✅        ✅     —        ✅
billing:read              ✅         ✅        —      —        —
billing:write             ✅         —         —      —        —
settings:read             ✅         ✅        —      —        —
settings:write            ✅         ✅        —      —        —
org:delete                ✅         —         —      —        —

* Row-level: scoped to their clientId (CLIENT) or assigned projects (PM)
† Row-level: isClientVisible=true only for CLIENT role
‡ Row-level: can only delete own messages
§ Row-level: scoped to their own invoices/contracts (clientId filter)
```

### 6.3 JWT Payload Changes

**Org User Access Token:**
```json
{
  "sub": "user-objectid",
  "email": "user@agency.com",
  "orgRole": "PROJECT_MANAGER",
  "organizationId": "org-objectid",
  "clientId": null,
  "sessionId": "uuid-v4",
  "type": "access",
  "isPlatformUser": false,
  "iat": 1748198400,
  "exp": 1748199300,
  "iss": "agencyos"
}
```

**Platform User Access Token:**
```json
{
  "sub": "platform-user-objectid",
  "email": "admin@agencyos.io",
  "platformRole": "PLATFORM_ADMIN",
  "sessionId": "uuid-v4",
  "type": "platform_access",
  "isPlatformUser": true,
  "iat": 1748198400,
  "exp": 1748199300,
  "iss": "agencyos-platform"
}
```

**Impersonation Token:**
```json
{
  "sub": "platform-user-objectid",
  "platformRole": "PLATFORM_ADMIN",
  "sessionId": "impersonation-session-id",
  "type": "platform_access",
  "isPlatformUser": true,
  "impersonating": {
    "organizationId": "target-org-id",
    "originalPlatformUserId": "platform-user-objectid",
    "grantedAt": 1748198400000
  },
  "iat": 1748198400,
  "exp": 1748202000,
  "iss": "agencyos-platform"
}
```

### 6.4 Redis Session Scoping

```
Session key patterns:

Org user sessions:
  refresh:{sessionId}                          → refresh token hash (7d TTL)
  revoked:session:{sessionId}                  → revoked flag (7d TTL)
  revoked:family:{family}                      → family revoked flag (7d TTL)
  user:{userId}                                → cached user doc (5min TTL)

Platform user sessions:
  platform:refresh:{sessionId}                 → platform refresh token hash (7d TTL)
  platform:revoked:session:{sessionId}         → platform session revoked flag
  platform:user:{userId}                       → cached platform user doc (5min TTL)
  platform:impersonation:{sessionId}           → impersonation context (1h TTL)

Org session invalidation (bulk):
  org:sessions:{orgId}                         → SET of active sessionIds for org
  → Used when suspending org to bulk-revoke all sessions
```

Session bulk invalidation on org suspend:
```typescript
async function invalidateOrgSessions(orgId: string) {
  const sessionSetKey = `org:sessions:${orgId}`;
  const sessionIds = await redis.smembers(sessionSetKey);

  const pipeline = redis.pipeline();
  for (const sessionId of sessionIds) {
    pipeline.set(`revoked:session:${sessionId}`, '1', 'EX', 86400); // 24h
  }
  pipeline.del(sessionSetKey);
  await pipeline.exec();

  logger.info({ orgId, sessionsRevoked: sessionIds.length }, 'Org sessions invalidated');
}

// In authenticate.ts — on successful login, track session in org SET:
await redis.sadd(`org:sessions:${user.organizationId}`, sessionId);
await redis.expire(`org:sessions:${user.organizationId}`, 7 * 24 * 3600); // 7d
```

---

## 7. Time-Based Trial System

### 7.1 Trial Lifecycle Fields on Organization

The `Organization` model already includes these fields (defined in Section 2.1):
- `trialStartsAt` — set when org is APPROVED
- `trialEndsAt` — set to `approvedAt + trialDays days`
- `expiresAt` — subscription expiry (for paid plans; set by Stripe webhook)
- `suspendedAt` — set when org is SUSPENDED

### 7.2 Trial Cron Jobs

Create `src/workers/trialLifecycleJobs.ts`:

```typescript
import cron from 'node-cron';
import { Organization } from '../models/Organization';
import { User } from '../models/User';
import { enqueueEmail } from '../workers/emailWorker';
import { cacheDel, cacheSet } from '../config/redis';
import { logger } from '../lib/logger';

/**
 * JOB 1: Trial expiry enforcement
 * Runs every hour at :00
 * Marks ACTIVE orgs on TRIAL plan whose trialEndsAt < now as EXPIRED_TRIAL
 */
cron.schedule('0 * * * *', async () => {
  logger.info('Running: trial expiry enforcement');
  try {
    const now = new Date();
    const expired = await Organization.find({
      status: 'ACTIVE',
      plan: 'TRIAL',
      trialEndsAt: { $lt: now },
    }).lean();

    for (const org of expired) {
      await Organization.updateOne({ _id: org._id }, { status: 'EXPIRED_TRIAL' });
      await cacheDel(`org:${org._id}:meta`);

      await enqueueEmail({
        type: 'org:trial-expired',
        to: org.ownerEmail,
        data: {
          orgName: org.name,
          upgradeUrl: `${process.env.FRONTEND_URL}/billing/upgrade`,
        },
      });

      logger.info({ orgId: org._id, orgName: org.name }, 'Trial expired');
    }

    logger.info({ count: expired.length }, 'Trial expiry job completed');
  } catch (err) {
    logger.error({ err }, 'Trial expiry job failed');
  }
}, { timezone: 'UTC' });

/**
 * JOB 2: Trial reminder at T-7 days
 * Runs daily at 09:00 UTC
 */
cron.schedule('0 9 * * *', async () => {
  logger.info('Running: trial 7-day reminder');
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sixDaysFromNow = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

    const orgs = await Organization.find({
      status: 'ACTIVE',
      plan: 'TRIAL',
      trialEndsAt: { $gte: sixDaysFromNow, $lte: sevenDaysFromNow },
    }).lean();

    for (const org of orgs) {
      await enqueueEmail({
        type: 'org:trial-expiring-7-days',
        to: org.ownerEmail,
        data: {
          orgName: org.name,
          daysLeft: 7,
          trialEndsAt: org.trialEndsAt,
          upgradeUrl: `${process.env.FRONTEND_URL}/billing/upgrade`,
        },
      });
    }

    logger.info({ count: orgs.length }, 'Trial 7-day reminder sent');
  } catch (err) {
    logger.error({ err }, 'Trial 7-day reminder job failed');
  }
}, { timezone: 'UTC' });

/**
 * JOB 3: Trial reminder at T-3 days
 * Runs daily at 09:00 UTC (after job 2)
 */
cron.schedule('15 9 * * *', async () => {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    const orgs = await Organization.find({
      status: 'ACTIVE',
      plan: 'TRIAL',
      trialEndsAt: { $gte: twoDaysFromNow, $lte: threeDaysFromNow },
    }).lean();

    for (const org of orgs) {
      await enqueueEmail({
        type: 'org:trial-expiring-3-days',
        to: org.ownerEmail,
        data: { orgName: org.name, daysLeft: 3, upgradeUrl: `${process.env.FRONTEND_URL}/billing/upgrade` },
      });
    }
  } catch (err) {
    logger.error({ err }, 'Trial 3-day reminder job failed');
  }
}, { timezone: 'UTC' });

/**
 * JOB 4: Trial reminder at T-1 day
 * Runs daily at 09:30 UTC
 */
cron.schedule('30 9 * * *', async () => {
  try {
    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    const halfDayFromNow = new Date(now.getTime() + 0.5 * 24 * 60 * 60 * 1000);

    const orgs = await Organization.find({
      status: 'ACTIVE',
      plan: 'TRIAL',
      trialEndsAt: { $gte: halfDayFromNow, $lte: oneDayFromNow },
    }).lean();

    for (const org of orgs) {
      await enqueueEmail({
        type: 'org:trial-expiring-1-day',
        to: org.ownerEmail,
        data: { orgName: org.name, daysLeft: 1, upgradeUrl: `${process.env.FRONTEND_URL}/billing/upgrade` },
      });
    }
  } catch (err) {
    logger.error({ err }, 'Trial 1-day reminder job failed');
  }
}, { timezone: 'UTC' });

/**
 * JOB 5: Subscription expiry enforcement
 * Runs every hour at :30
 * Marks ACTIVE orgs (non-trial) whose expiresAt < now as SUSPENDED
 */
cron.schedule('30 * * * *', async () => {
  try {
    const now = new Date();
    const expired = await Organization.find({
      status: 'ACTIVE',
      plan: { $ne: 'TRIAL' },
      expiresAt: { $lt: now },
    }).lean();

    for (const org of expired) {
      // 7-day grace period: suspend rather than expire immediately
      const gracePeriodEnd = new Date(org.expiresAt!.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (new Date() < gracePeriodEnd) {
        // Still in grace period — send reminder but don't suspend
        await enqueueEmail({
          type: 'org:payment-overdue-grace',
          to: org.ownerEmail,
          data: { orgName: org.name, gracePeriodEnd, updateBillingUrl: `${process.env.FRONTEND_URL}/billing` },
        });
      } else {
        // Grace period over — suspend
        await Organization.updateOne({ _id: org._id }, { status: 'SUSPENDED', suspendedAt: new Date() });
        await cacheDel(`org:${org._id}:meta`);
        await enqueueEmail({
          type: 'org:suspended-payment',
          to: org.ownerEmail,
          data: { orgName: org.name, reactivateUrl: `${process.env.FRONTEND_URL}/billing` },
        });
      }
    }
  } catch (err) {
    logger.error({ err }, 'Subscription expiry job failed');
  }
}, { timezone: 'UTC' });

/**
 * JOB 6: Health score computation (existing — add organizationId to query)
 * Every 6 hours
 */
cron.schedule('0 */6 * * *', async () => {
  try {
    // Process in batches to avoid memory issues
    const batchSize = 100;
    let page = 0;
    let processed = 0;

    while (true) {
      const projects = await Project.find({ status: 'ACTIVE' })
        .select('_id organizationId')
        .skip(page * batchSize)
        .limit(batchSize)
        .lean();

      if (projects.length === 0) break;

      for (const project of projects) {
        await computeHealthScore(project._id.toString(), project.organizationId.toString());
      }

      processed += projects.length;
      page++;
    }

    logger.info({ processed }, 'Health score computation completed');
  } catch (err) {
    logger.error({ err }, 'Health score cron failed');
  }
}, { timezone: 'UTC' });
```

### 7.3 Stripe Subscription Integration for Trial Conversion

When a trial org subscribes via Stripe, the Stripe webhook `customer.subscription.created` must:

```typescript
// In invoices.service.ts or new billing.service.ts:
async function handleStripeSubscriptionCreated(subscription: Stripe.Subscription) {
  const org = await Organization.findOne({
    stripeCustomerId: subscription.customer as string,
  });
  if (!org) return; // Not an AgencyOS customer

  const plan = mapStripePriceToPlan(subscription.items.data[0].price.id);
  const expiresAt = new Date(subscription.current_period_end * 1000);

  await Organization.updateOne({ _id: org._id }, {
    status: 'ACTIVE',
    plan,
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.items.data[0].price.id,
    expiresAt,
    mrr: subscription.items.data[0].price.unit_amount ?? 0,
    limits: Organization.getDefaultLimits(plan),
    // Clear trial fields if converting from trial
    trialEndsAt: org.plan === 'TRIAL' ? new Date() : org.trialEndsAt,
  });

  await cacheDel(`org:${org._id}:meta`);

  await enqueueEmail({
    type: 'org:subscription-activated',
    to: org.ownerEmail,
    data: { orgName: org.name, plan, expiresAt, dashboardUrl: `${process.env.FRONTEND_URL}/dashboard` },
  });
}

function mapStripePriceToPlan(priceId: string): OrgPlan {
  const map: Record<string, OrgPlan> = {
    [env.STRIPE_PRICE_STARTER_MONTHLY]: 'STARTER',
    [env.STRIPE_PRICE_STARTER_ANNUAL]: 'STARTER',
    [env.STRIPE_PRICE_GROWTH_MONTHLY]: 'GROWTH',
    [env.STRIPE_PRICE_GROWTH_ANNUAL]: 'GROWTH',
    [env.STRIPE_PRICE_ENTERPRISE_MONTHLY]: 'ENTERPRISE',
    [env.STRIPE_PRICE_ENTERPRISE_ANNUAL]: 'ENTERPRISE',
  };
  return map[priceId] ?? 'STARTER';
}
```

---

## 8. Automated Email Lifecycle System

### 8.1 Email Queue Architecture

The existing `emailWorker.ts` Bull queue handles async email delivery. It must be extended to support:
- **Scheduled emails** (send at a future time)
- **Template-based rendering** (named template system)
- **Retry with exponential backoff** (already exists)
- **Email tracking** (open/click tracking via pixel/redirect)
- **Unsubscribe handling** (transactional vs. marketing)
- **Org-specific branding** (agency name, logo, colors)

```typescript
// Extended email job schema:
interface EmailJob {
  type: EmailTemplateType;          // named template key
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  data: Record<string, unknown>;    // template-specific variables
  organizationId?: string;          // for org-branded emails
  scheduledFor?: Date;              // delayed email (Bull's delay option)
  trackingId?: string;              // for open tracking
  tags?: string[];                  // 'transactional' | 'lifecycle' | 'marketing'
  priority?: number;                // Bull queue priority (1=highest)
  retryPolicy?: {
    attempts: number;
    backoff: number;
  };
}

// emailWorker.ts — updated processor:
emailQueue.process(async (job: Bull.Job<EmailJob>) => {
  const { type, to, data, organizationId } = job.data;

  // Load org branding if applicable
  let branding = defaultBranding;
  if (organizationId) {
    const org = await Organization.findById(organizationId)
      .select('name logoUrl features')
      .lean();
    branding = {
      agencyName: org?.name ?? defaultBranding.agencyName,
      logoUrl: org?.logoUrl ?? defaultBranding.logoUrl,
    };
  }

  // Render template
  const { subject, html, text } = renderEmailTemplate(type, { ...data, ...branding });

  // Send via Nodemailer
  await transporter.sendMail({
    from: `"${branding.agencyName}" <${env.SMTP_FROM ?? env.SMTP_USER}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
    text,
  });

  logger.info({ type, to, jobId: job.id }, 'Email sent');
});
```

### 8.2 Complete Email Template Registry

```typescript
// src/lib/emailTemplates.ts

export type EmailTemplateType =
  // ── Organization Lifecycle ────────────────────────────────────────────
  | 'org:registration-received'      // Registrant: "We got your application"
  | 'org:approved'                   // Owner: "You're approved! Trial started"
  | 'org:rejected'                   // Owner: "Application not approved"
  | 'org:trial-started'              // Owner: "Your 14-day trial has started"
  | 'org:trial-expiring-7-days'      // Owner: "7 days left in your trial"
  | 'org:trial-expiring-3-days'      // Owner: "3 days left in your trial"
  | 'org:trial-expiring-1-day'       // Owner: "Trial ends tomorrow"
  | 'org:trial-expired'              // Owner: "Your trial has expired"
  | 'org:subscription-activated'     // Owner: "Subscription confirmed"
  | 'org:subscription-updated'       // Owner: "Plan changed"
  | 'org:subscription-cancelled'     // Owner: "Subscription cancelled"
  | 'org:payment-overdue-grace'      // Owner: "Payment failed, grace period"
  | 'org:suspended'                  // Owner: "Account suspended"
  | 'org:suspended-payment'          // Owner: "Suspended for non-payment"
  | 'org:reactivated'                // Owner: "Account reactivated"
  | 'org:deletion-scheduled'         // Owner: "Org deletion in 30 days"
  | 'org:ownership-transferred'      // New owner: "Ownership transferred to you"

  // ── Platform Admin Notifications ─────────────────────────────────────
  | 'platform:new-org-pending'       // Platform admins: "New org needs review"
  | 'platform:org-deletion-requested' // Platform: "Org deletion scheduled"

  // ── Team Member Onboarding ────────────────────────────────────────────
  | 'team:invited'                   // New team member invite (temp password)
  | 'team:welcome'                   // Welcome after first login

  // ── Client Portal ────────────────────────────────────────────────────
  | 'client:invited'                 // Client portal invite
  | 'client:onboarding-reminder'     // Client hasn't completed setup

  // ── Auth ──────────────────────────────────────────────────────────────
  | 'auth:magic-link'
  | 'auth:password-reset'
  | 'auth:password-changed'          // Notification after PW change

  // ── Invoices ─────────────────────────────────────────────────────────
  | 'invoice:sent'
  | 'invoice:reminder-3-days'
  | 'invoice:overdue'
  | 'invoice:paid'
  | 'invoice:voided'

  // ── Contracts ────────────────────────────────────────────────────────
  | 'contract:sent'
  | 'contract:signed'
  | 'contract:executed'

  // ── Approvals ────────────────────────────────────────────────────────
  | 'approval:needed'
  | 'approval:approved'
  | 'approval:rejected'
  | 'approval:revision-requested'
;
```

### 8.3 Template Naming Convention

Pattern: `{domain}:{event-slug}`

- Domain: `org`, `platform`, `team`, `client`, `auth`, `invoice`, `contract`, `approval`
- Event slug: kebab-case describing the trigger

File structure for templates:
```
src/lib/emailTemplates/
├── index.ts                    # renderEmailTemplate() dispatcher
├── base/
│   ├── layout.ts               # Base HTML wrapper (header, footer, styles)
│   └── brandedLayout.ts        # Org-branded variant
├── org/
│   ├── registration-received.ts
│   ├── approved.ts
│   ├── rejected.ts
│   ├── trial-expiring-7-days.ts
│   ├── trial-expiring-3-days.ts
│   ├── trial-expiring-1-day.ts
│   ├── trial-expired.ts
│   ├── subscription-activated.ts
│   └── suspended.ts
├── platform/
│   ├── new-org-pending.ts
│   └── org-deletion-requested.ts
├── team/
│   └── invited.ts
├── client/
│   └── invited.ts
├── auth/
│   ├── magic-link.ts
│   └── password-reset.ts
├── invoice/
│   ├── sent.ts
│   └── overdue.ts
├── contract/
│   └── sent.ts
└── approval/
    └── needed.ts
```

### 8.4 Transactional vs. Marketing Email Separation

```typescript
// Tag emails for compliance and unsubscribe handling:
const TRANSACTIONAL_TYPES: EmailTemplateType[] = [
  'auth:magic-link',
  'auth:password-reset',
  'auth:password-changed',
  'invoice:sent',
  'invoice:paid',
  'contract:sent',
  'contract:signed',
  'approval:needed',
  'approval:approved',
  'team:invited',
  'client:invited',
  'org:approved',
  'org:rejected',
  'org:suspended',
  'org:subscription-activated',
];

// Transactional emails: CANNOT be unsubscribed from
// Marketing emails (reminders, upsells): honor unsubscribe preferences

const MARKETING_TYPES: EmailTemplateType[] = [
  'org:trial-expiring-7-days',
  'org:trial-expiring-3-days',
  'org:trial-expiring-1-day',
  'org:trial-expired',
  'invoice:reminder-3-days',
  'client:onboarding-reminder',
];

// Before sending marketing emails, check User.notificationPrefs.email.digest
// and org-level unsubscribe tracking
```

### 8.5 Email Retry Logic

```typescript
// Bull queue configuration for email worker:
const emailQueue = new Bull<EmailJob>('email', {
  redis: bullRedisOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,    // 2s, 4s, 8s, 16s, 32s
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// Scheduled emails via Bull's delay feature:
async function enqueueEmail(job: EmailJob) {
  const delay = job.scheduledFor
    ? Math.max(0, job.scheduledFor.getTime() - Date.now())
    : 0;

  return emailQueue.add(job, {
    delay,
    priority: job.priority ?? 5,
    attempts: job.retryPolicy?.attempts ?? 5,
    backoff: { type: 'exponential', delay: job.retryPolicy?.backoff ?? 2000 },
  });
}
```

---

## 9. Multi-Tenant Socket.io Architecture

### 9.1 Current vs. New Room Structure

**BEFORE:**
```
Rooms:
  user:{userId}       → personal notifications
  project:{projectId} → project-level events
```

**AFTER:**
```
Rooms (scoped, hierarchical):
  organization:{orgId}                     → org-wide broadcasts (suspension, announcements)
  organization:{orgId}:project:{projectId} → project events (org-scoped)
  organization:{orgId}:user:{userId}       → personal notifications (org-scoped)

Note: userId rooms are also org-prefixed to prevent cross-org notification injection.
```

### 9.2 Updated `socketServer.ts`

```typescript
// src/sockets/socketServer.ts — complete rewrite

import { Server as SocketServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { verifyAccessToken } from '../lib/jwt';
import { verifyPlatformAccessToken } from '../lib/platformJwt';
import { Organization } from '../models/Organization';
import { User } from '../models/User';
import { Project } from '../models/Project';
import { logger } from '../lib/logger';
import { pubClient, subClient } from '../config/redis';
import { AuthenticationError, AuthorizationError } from '../lib/errors';

export function initSocketServer(httpServer: http.Server, redisAvailable: boolean): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: [env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── Redis adapter for horizontal scaling ─────────────────────────────
  // NOTE: The existing codebase installs @socket.io/redis-adapter but doesn't use it.
  // This MUST be enabled for multi-instance deployment.
  if (redisAvailable) {
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.io Redis adapter enabled');
  } else {
    logger.warn('Redis unavailable — Socket.io running in single-instance mode');
  }

  // ── Authentication middleware ─────────────────────────────────────────
  io.use(async (socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) throw new AuthenticationError('No token provided');

      // Try org user token first
      let decoded: any;
      let isPlatformUser = false;

      try {
        decoded = verifyAccessToken(token);
      } catch {
        // Try platform token (platform admins may connect for monitoring)
        decoded = verifyPlatformAccessToken(token);
        isPlatformUser = true;
      }

      // Validate org user
      if (!isPlatformUser) {
        const user = await User.findById(decoded.sub)
          .select('_id name email orgRole organizationId isActive')
          .lean();

        if (!user || !user.isActive) throw new AuthenticationError('User not found or inactive');

        // Validate organization is active
        const org = await Organization.findById(user.organizationId)
          .select('status name')
          .lean();

        if (!org || !['ACTIVE', 'APPROVED'].includes(org.status)) {
          throw new AuthorizationError('Organization is not active');
        }

        socket.data = {
          userId: user._id.toString(),
          orgRole: user.orgRole,
          organizationId: user.organizationId.toString(),
          name: user.name,
          isPlatformUser: false,
        };
      } else {
        socket.data = {
          userId: decoded.sub,
          platformRole: decoded.platformRole,
          isPlatformUser: true,
          organizationId: decoded.impersonating?.organizationId,
        };
      }

      next();
    } catch (err) {
      next(new Error((err as Error).message));
    }
  });

  // ── Connection handler ────────────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    const { userId, organizationId, orgRole, isPlatformUser } = socket.data;

    logger.debug({ userId, organizationId, socketId: socket.id }, 'Socket connected');

    // Auto-join personal room (org-scoped)
    if (organizationId) {
      socket.join(`organization:${organizationId}:user:${userId}`);
      socket.join(`organization:${organizationId}`);     // org broadcast room
    }

    // ── join:project ────────────────────────────────────────────────────
    socket.on('join:project', async (projectId: string) => {
      try {
        if (!organizationId) return;

        // CRITICAL: Validate project belongs to the user's organization
        const project = await Project.findOne({
          _id: projectId,
          organizationId,              // ← tenant isolation: project must be in same org
        }).select('_id contributors pm clientId').lean();

        if (!project) {
          socket.emit('error', { message: 'Project not found or access denied' });
          return;
        }

        // Row-level access check
        if (orgRole === 'CLIENT') {
          const user = await User.findById(userId).select('clientId').lean();
          if (String(project.clientId) !== String(user?.clientId)) {
            socket.emit('error', { message: 'Access denied to this project' });
            return;
          }
        } else if (orgRole === 'CONTRIBUTOR') {
          const isContributor = project.contributors.some(c => String(c) === userId);
          if (!isContributor) {
            socket.emit('error', { message: 'Access denied to this project' });
            return;
          }
        }

        const roomName = `organization:${organizationId}:project:${projectId}`;
        socket.join(roomName);
        logger.debug({ userId, projectId, roomName }, 'Joined project room');
      } catch (err) {
        logger.error({ err, projectId }, 'join:project error');
        socket.emit('error', { message: 'Failed to join project room' });
      }
    });

    // ── leave:project ───────────────────────────────────────────────────
    socket.on('leave:project', (projectId: string) => {
      socket.leave(`organization:${organizationId}:project:${projectId}`);
    });

    // ── typing:start / typing:stop ──────────────────────────────────────
    socket.on('typing:start', ({ projectId, channelId }: { projectId: string; channelId: string }) => {
      if (!organizationId) return;
      // Validate projectId belongs to org (basic check from socket data)
      const room = `organization:${organizationId}:project:${projectId}`;
      socket.to(room).emit('typing:start', { userId, channelId });
    });

    socket.on('typing:stop', ({ projectId, channelId }: { projectId: string; channelId: string }) => {
      if (!organizationId) return;
      const room = `organization:${organizationId}:project:${projectId}`;
      socket.to(room).emit('typing:stop', { userId, channelId });
    });

    // ── presence:update ─────────────────────────────────────────────────
    socket.on('presence:update', (status: 'online' | 'away' | 'offline') => {
      if (!organizationId) return;
      // Broadcast to org room only
      socket.to(`organization:${organizationId}`).emit('presence:update', { userId, status });
    });

    // ── disconnect ──────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (organizationId) {
        // Broadcast offline presence to org
        io.to(`organization:${organizationId}`).emit('presence:update', {
          userId,
          status: 'offline',
        });
      }
      logger.debug({ userId, socketId: socket.id }, 'Socket disconnected');
    });
  });

  return io;
}

// ── Emit helpers for service layer ──────────────────────────────────────

/**
 * Emit to a specific project room within an org
 */
export function emitToProject(
  io: SocketServer,
  organizationId: string,
  projectId: string,
  event: string,
  data: unknown
) {
  io.to(`organization:${organizationId}:project:${projectId}`).emit(event, data);
}

/**
 * Emit to a specific user within an org
 */
export function emitToUser(
  io: SocketServer,
  organizationId: string,
  userId: string,
  event: string,
  data: unknown
) {
  io.to(`organization:${organizationId}:user:${userId}`).emit(event, data);
}

/**
 * Emit to all users in an organization (org-wide broadcast)
 */
export function emitToOrg(io: SocketServer, organizationId: string, event: string, data: unknown) {
  io.to(`organization:${organizationId}`).emit(event, data);
}
```

### 9.3 Updated Event Calls in Service Layer

Every service that calls `io.to(...).emit(...)` must be updated:

```typescript
// BEFORE (messages.service.ts):
io.to(`project:${projectId}`).emit('message:new', populated);

// AFTER:
emitToProject(io, organizationId, projectId, 'message:new', populated);

// BEFORE (notifications.service.ts):
io.to(`user:${userId}`).emit('notification:new', notification);

// AFTER:
emitToUser(io, organizationId, userId, 'notification:new', notification);
```

### 9.4 Cross-Tenant Protection Checklist

| Protection Point | Implementation |
|-----------------|----------------|
| Socket auth validates org status | ✅ `initSocketServer` middleware |
| `join:project` validates `organizationId` match | ✅ `Project.findOne({ _id, organizationId })` |
| Room names are org-prefixed | ✅ `organization:{orgId}:project:{id}` |
| Typing events scoped to org room | ✅ `socket.to('organization:{orgId}:project:{id}')` |
| Presence updates scoped to org | ✅ `io.to('organization:{orgId}')` |
| Redis adapter isolates rooms across instances | ✅ Redis pub/sub channels per room name |
| Platform user sockets can only join org rooms when impersonating | ✅ `organizationId` from impersonation token |

### 9.5 Redis Adapter — Horizontal Scaling

```typescript
// config/redis.ts — already creates pubClient, subClient, mainClient
// Ensure pubClient and subClient are SEPARATE connections (cannot be reused):

export const pubClient = new Redis(redisConfig);
export const subClient = pubClient.duplicate();   // creates separate connection

// In initSocketServer:
io.adapter(createAdapter(pubClient, subClient));

// With Redis adapter:
// - emitToProject() fans out via Redis pub/sub to ALL Node.js instances
// - A user connected to instance A receives events emitted from instance B
// - Room membership is tracked per-instance; cross-instance events use pub/sub
// - This was already installed (@socket.io/redis-adapter) but never wired up
```

---

## 10. Tenant-Aware Redis & Cache Strategy

### 10.1 Complete Redis Key Namespace Specification

```
ALL keys follow: {domain}:{organizationId}:{entity}:{id}:{subkey}

Organization Meta:
  org:{orgId}:meta                             → Organization doc (5min TTL)
  org:{orgId}:sessions                         → SET of active sessionIds (7d)
  org:{orgId}:analytics                        → org analytics cache (2min)
  org:{orgId}:storage-usage                    → storage usage bytes (5min)

Users (org-scoped):
  org:{orgId}:user:{userId}                    → User doc (5min TTL)
  Note: previously was user:{userId} — org prefix prevents cross-org collisions

Projects:
  org:{orgId}:projects:list:{hash}             → project list cache (1min)
  org:{orgId}:project:{projectId}              → single project (5min)
  org:{orgId}:project:{projectId}:health       → health score (5min)

Clients:
  org:{orgId}:client:{clientId}                → client doc (5min)
  org:{orgId}:clients:list:{hash}              → client list (2min)

Analytics:
  org:{orgId}:analytics:agency                 → agency dashboard (5min)
  org:{orgId}:analytics:project:{projectId}    → project analytics (2min)
  org:{orgId}:analytics:client:{clientId}      → client analytics (2min)

Auth tokens (already unscoped by design — sessionId is globally unique):
  refresh:{sessionId}                          → refresh token hash (7d)
  revoked:session:{sessionId}                  → revoked (24h)
  revoked:family:{family}                      → family revoked (7d)
  magic-link:{hash}                            → magic link token (72h)
  invite:{hash}                                → invite token (72h)

Platform (separate namespace):
  platform:user:{userId}                       → PlatformUser doc (5min)
  platform:refresh:{sessionId}                 → platform refresh hash (7d)
  platform:revoked:session:{sessionId}         → revoked (24h)
  platform:impersonation:{sessionId}           → impersonation context (1h)
  platform:analytics:overview                  → global analytics (5min)
  platform:analytics:mrr                       → MRR data (1h)
  platform:analytics:funnel                    → onboarding funnel (30min)

Rate limiting (already IP-based, add org-level throttles):
  rate:api:{orgId}                             → API request count (1min window)
  rate:org-register:{ip}                       → registration attempts (1h)
  rate:upload:{orgId}:{userId}                 → upload rate (1min)
```

### 10.2 Cache Invalidation Groups

Define invalidation groups so related caches are cleared together:

```typescript
// src/lib/cacheInvalidation.ts

export const CacheGroups = {
  // Invalidate all caches for a user
  user: (orgId: string, userId: string) => [
    `org:${orgId}:user:${userId}`,
  ],

  // Invalidate project-related caches
  project: (orgId: string, projectId: string) => [
    `org:${orgId}:project:${projectId}`,
    `org:${orgId}:project:${projectId}:health`,
    `org:${orgId}:analytics:project:${projectId}`,
    `org:${orgId}:analytics:agency`,  // project count changes affect agency analytics
  ],

  // Invalidate client-related caches
  client: (orgId: string, clientId: string) => [
    `org:${orgId}:client:${clientId}`,
    `org:${orgId}:analytics:client:${clientId}`,
    `org:${orgId}:analytics:agency`,
  ],

  // Invalidate all org analytics (after any significant change)
  orgAnalytics: (orgId: string) => [
    `org:${orgId}:analytics:agency`,
    `org:${orgId}:analytics`,
  ],

  // Invalidate org meta (after status/plan change)
  orgMeta: (orgId: string) => [
    `org:${orgId}:meta`,
    `org:${orgId}:storage-usage`,
  ],

  // Purge ALL org caches (on org deletion/suspension)
  orgPurge: async (orgId: string) => {
    const keys = await redis.keys(`org:${orgId}:*`);
    if (keys.length > 0) await redis.del(...keys);
  },
};

export async function invalidateCache(keys: string[]) {
  if (keys.length === 0) return;
  const pipeline = redis.pipeline();
  keys.forEach(k => pipeline.del(k));
  await pipeline.exec();
}
```

### 10.3 Org-Level API Rate Limiting

Add org-level rate limiting in addition to IP-based limits:

```typescript
// src/middleware/rateLimiter.ts — add org-aware limiter

export const orgApiLimiter = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.isPlatformUser) return next();

  const orgId = req.user.organizationId;
  const plan = req.organization?.plan ?? 'TRIAL';

  // Plan-based API limits (requests per minute per org)
  const limits: Record<OrgPlan, number> = {
    TRIAL: 60,
    STARTER: 300,
    GROWTH: 1000,
    ENTERPRISE: 5000,
  };

  const limitKey = `rate:api:${orgId}`;
  const current = await redis.incr(limitKey);
  if (current === 1) await redis.expire(limitKey, 60);

  const limit = limits[plan];
  if (current > limit) {
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', 0);
    return next(new RateLimitError(`Organization API limit exceeded (${limit}/min for ${plan} plan)`));
  }

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current));
  next();
};
```

### 10.4 Cache Helper Updates

```typescript
// config/redis.ts — updated helpers with org namespace

export async function orgCacheGet(orgId: string, key: string): Promise<string | null> {
  return cacheGet(`org:${orgId}:${key}`);
}

export async function orgCacheSet(
  orgId: string,
  key: string,
  value: string,
  ttlSeconds: number
): Promise<void> {
  return cacheSet(`org:${orgId}:${key}`, value, ttlSeconds);
}

export async function orgCacheDel(orgId: string, ...keys: string[]): Promise<void> {
  return cacheDel(...keys.map(k => `org:${orgId}:${k}`));
}
```

---

## 11. Tenant-Aware Storage System

### 11.1 S3/R2 Key Structure

```
All storage keys follow:
  organizations/{orgId}/{category}/{...path}

Examples:
  organizations/64abc123/projects/64proj456/files/2026-01-15-report.pdf
  organizations/64abc123/projects/64proj456/files/versions/v2-report.pdf
  organizations/64abc123/invoices/INV-2026-0001.pdf
  organizations/64abc123/contracts/64contract789.pdf
  organizations/64abc123/assets/logo.png
  organizations/64abc123/exports/2026-01-15-data-export.zip
```

### 11.2 Updated `storage.ts`

```typescript
// config/storage.ts — additions

/**
 * Generates org-scoped storage key
 * Replaces: generateStorageKey(prefix, filename)
 */
export function generateOrgStorageKey(
  organizationId: string,
  category: 'projects' | 'invoices' | 'contracts' | 'assets' | 'exports',
  filename: string,
  subPath?: string
): string {
  const sanitizedFilename = filename
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-');
  const timestamp = Date.now();
  const path = subPath ? `${subPath}/${timestamp}-${sanitizedFilename}` : `${timestamp}-${sanitizedFilename}`;
  return `organizations/${organizationId}/${category}/${path}`;
}

/**
 * Generate org-scoped project file key
 */
export function generateProjectFileKey(
  organizationId: string,
  projectId: string,
  folder: string,
  filename: string
): string {
  return generateOrgStorageKey(
    organizationId,
    'projects',
    filename,
    `${projectId}/${folder || 'root'}`
  );
}

/**
 * Validate that a storage key belongs to the requesting org
 * Prevents accessing other orgs' S3 objects via key manipulation
 */
export function validateStorageKeyOwnership(
  storageKey: string,
  organizationId: string
): boolean {
  return storageKey.startsWith(`organizations/${organizationId}/`);
}

/**
 * Get signed download URL — validates org ownership before signing
 */
export async function getOrgSignedUrl(
  storageKey: string,
  organizationId: string,
  expiresInSeconds: number = 300
): Promise<string> {
  if (!validateStorageKeyOwnership(storageKey, organizationId)) {
    throw new AuthorizationError('Storage access denied: cross-organization key');
  }
  return getSignedUrl(storageKey, expiresInSeconds);
}
```

### 11.3 Per-Organization Storage Quotas

```typescript
// In files.service.ts — updated uploadFile():

async function uploadFile(
  organizationId: string,
  projectId: string,
  clientId: string,
  fileBuffer: Buffer,
  originalname: string,
  mimetype: string,
  size: number,
  uploadedBy: string,
  options: { folder?: string; isClientVisible?: boolean; existingFileId?: string }
) {
  // ── 1. Check organization storage quota ─────────────────────────────
  const org = await Organization.findById(organizationId)
    .select('usage limits name')
    .lean();

  if (!org) throw new NotFoundError('Organization not found');

  if (org.usage.storageUsedBytes + size > org.limits.storageBytes) {
    const usedGB = (org.usage.storageUsedBytes / 1024**3).toFixed(2);
    const limitGB = (org.limits.storageBytes / 1024**3).toFixed(0);
    throw new FileError(
      `Storage quota exceeded. Used: ${usedGB}GB / ${limitGB}GB. Upgrade your plan to add more storage.`
    );
  }

  // ── 2. Generate org-scoped storage key ──────────────────────────────
  const storageKey = generateProjectFileKey(organizationId, projectId, options.folder ?? '/', originalname);

  // ── 3. Upload to S3/R2 with server-side encryption ──────────────────
  await uploadToStorage(storageKey, fileBuffer, mimetype, {
    ServerSideEncryption: 'AES256',
    Metadata: {
      organizationId,
      projectId,
      uploadedBy,
    },
  });

  // ── 4. Create File document ─────────────────────────────────────────
  const file = await File.create({
    organizationId,
    projectId,
    clientId,
    uploadedBy,
    name: originalname,
    originalName: originalname,
    mimeType: mimetype,
    sizeBytes: size,
    storageKey,
    folder: options.folder ?? '/',
    isClientVisible: options.isClientVisible ?? false,
    scanStatus: 'PENDING',
    version: options.existingFileId ? await getNextVersionNumber(options.existingFileId) : 1,
    parentFileId: options.existingFileId,
  });

  // ── 5. Update org storage usage (atomic) ────────────────────────────
  await Organization.updateOne(
    { _id: organizationId },
    { $inc: { 'usage.storageUsedBytes': size } }
  );

  // Invalidate storage usage cache
  await orgCacheDel(organizationId, 'storage-usage');

  // ── 6. Queue virus scan ─────────────────────────────────────────────
  if (isRedisAvailable()) {
    await fileScanQueue.add({ fileId: file._id.toString(), storageKey, organizationId });
  } else {
    await File.updateOne({ _id: file._id }, { scanStatus: 'CLEAN' });
  }

  // ── 7. Emit socket event ─────────────────────────────────────────────
  emitToProject(io, organizationId, projectId, 'file:uploaded', {
    fileId: file._id,
    name: originalname,
    uploadedBy,
    projectId,
  });

  return file;
}
```

### 11.4 Storage Analytics Per Organization

```typescript
// Monthly cron: update org storage stats
cron.schedule('0 2 * * *', async () => {
  // For each active org, recompute actual S3 storage usage
  // (to reconcile with the counter-based tracking)
  const orgs = await Organization.find({ status: 'ACTIVE' }).select('_id').lean();

  for (const org of orgs) {
    const orgId = org._id.toString();

    // Sum file sizes from DB (fast, doesn't require S3 list)
    const result = await File.aggregate([
      { $match: { organizationId: org._id } },
      { $group: { _id: null, totalBytes: { $sum: '$sizeBytes' } } },
    ]);

    const actualBytes = result[0]?.totalBytes ?? 0;

    await Organization.updateOne(
      { _id: org._id },
      { 'usage.storageUsedBytes': actualBytes }
    );

    await orgCacheDel(orgId, 'storage-usage');
  }
}, { timezone: 'UTC' });
```

---

## 12. Platform Analytics

### 12.1 Platform Analytics Schema (Aggregated)

Create `src/modules/platform/analytics/platformAnalytics.service.ts`:

```typescript
interface PlatformOverview {
  // Organizations
  totalOrgs: number;
  activeOrgs: number;            // status: ACTIVE
  pendingApproval: number;
  trialOrgs: number;             // status: ACTIVE, plan: TRIAL
  paidOrgs: number;              // status: ACTIVE, plan: not TRIAL
  suspendedOrgs: number;
  expiredTrials: number;

  // Revenue
  totalMRR: number;              // sum of org.mrr for ACTIVE paid orgs
  avgMRR: number;                // totalMRR / paidOrgs
  mrrByPlan: { STARTER: number; GROWTH: number; ENTERPRISE: number };

  // Usage
  totalUsers: number;
  totalStorage: number;          // sum of usage.storageUsedBytes across all orgs
  totalProjects: number;
  totalClients: number;

  // Trends (last 30 days)
  newOrgsLast30d: number;
  newPaidLast30d: number;
  churnedLast30d: number;        // orgs that moved to SUSPENDED/ARCHIVED/EXPIRED_TRIAL
  trialConversionRate: number;   // paidOrgs / (paidOrgs + expiredTrials)
}

async function getPlatformOverview(): Promise<PlatformOverview> {
  // Check cache first (5 minute TTL)
  const cached = await cacheGet('platform:analytics:overview');
  if (cached) return JSON.parse(cached);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Run parallel aggregations
  const [
    orgStatusCounts,
    mrrAgg,
    usageAgg,
    newOrgs,
    churnedOrgs,
  ] = await Promise.all([
    // Org status distribution
    Organization.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // MRR by plan (ACTIVE paid orgs)
    Organization.aggregate([
      { $match: { status: 'ACTIVE', plan: { $ne: 'TRIAL' } } },
      { $group: {
        _id: '$plan',
        totalMRR: { $sum: '$mrr' },
        count: { $sum: 1 },
      }},
    ]),

    // Global usage
    Organization.aggregate([
      { $group: {
        _id: null,
        totalStorage: { $sum: '$usage.storageUsedBytes' },
        totalSeats: { $sum: '$usage.seats' },
        totalProjects: { $sum: '$usage.projects' },
        totalClients: { $sum: '$usage.clients' },
      }},
    ]),

    // New orgs (last 30 days)
    Organization.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),

    // Churned orgs (moved to SUSPENDED/EXPIRED_TRIAL/ARCHIVED in last 30 days)
    Organization.countDocuments({
      status: { $in: ['SUSPENDED', 'EXPIRED_TRIAL', 'ARCHIVED'] },
      updatedAt: { $gte: thirtyDaysAgo },
    }),
  ]);

  // Process status counts
  const statusMap = Object.fromEntries(orgStatusCounts.map(r => [r._id, r.count]));

  // Process MRR
  const mrrMap = Object.fromEntries(mrrAgg.map(r => [r._id, { mrr: r.totalMRR, count: r.count }]));
  const totalMRR = mrrAgg.reduce((sum, r) => sum + r.totalMRR, 0);
  const paidOrgs = mrrAgg.reduce((sum, r) => sum + r.count, 0);

  const usage = usageAgg[0] ?? {};
  const expiredTrials = statusMap['EXPIRED_TRIAL'] ?? 0;

  const result: PlatformOverview = {
    totalOrgs: Object.values(statusMap).reduce((a, b) => a + b, 0),
    activeOrgs: statusMap['ACTIVE'] ?? 0,
    pendingApproval: statusMap['PENDING_APPROVAL'] ?? 0,
    trialOrgs: 0, // computed separately
    paidOrgs,
    suspendedOrgs: statusMap['SUSPENDED'] ?? 0,
    expiredTrials,
    totalMRR,
    avgMRR: paidOrgs > 0 ? Math.round(totalMRR / paidOrgs) : 0,
    mrrByPlan: {
      STARTER: mrrMap['STARTER']?.mrr ?? 0,
      GROWTH: mrrMap['GROWTH']?.mrr ?? 0,
      ENTERPRISE: mrrMap['ENTERPRISE']?.mrr ?? 0,
    },
    totalUsers: usage.totalSeats ?? 0,
    totalStorage: usage.totalStorage ?? 0,
    totalProjects: usage.totalProjects ?? 0,
    totalClients: usage.totalClients ?? 0,
    newOrgsLast30d: newOrgs,
    newPaidLast30d: 0, // separate query needed
    churnedLast30d: churnedOrgs,
    trialConversionRate: (paidOrgs + expiredTrials) > 0
      ? Math.round((paidOrgs / (paidOrgs + expiredTrials)) * 100)
      : 0,
  };

  await cacheSet('platform:analytics:overview', JSON.stringify(result), 300); // 5 min
  return result;
}
```

### 12.2 Onboarding Funnel Analytics

```typescript
async function getOnboardingFunnel() {
  const cached = await cacheGet('platform:analytics:funnel');
  if (cached) return JSON.parse(cached);

  // Registration → Pending → Approved → Trial → Paid conversion funnel
  const [
    totalRegistered,
    pendingApproval,
    approved,
    activeTrial,
    converted,
    expired,
  ] = await Promise.all([
    Organization.countDocuments({}),
    Organization.countDocuments({ status: 'PENDING_APPROVAL' }),
    Organization.countDocuments({ approvedAt: { $exists: true } }),
    Organization.countDocuments({ status: 'ACTIVE', plan: 'TRIAL' }),
    Organization.countDocuments({ status: 'ACTIVE', plan: { $ne: 'TRIAL' } }),
    Organization.countDocuments({ status: 'EXPIRED_TRIAL' }),
  ]);

  const funnel = {
    stages: [
      { name: 'Registered',     count: totalRegistered, rate: 100 },
      { name: 'Approved',       count: approved, rate: totalRegistered ? Math.round(approved/totalRegistered*100) : 0 },
      { name: 'Active Trial',   count: activeTrial + converted + expired, rate: approved ? Math.round((activeTrial+converted+expired)/approved*100) : 0 },
      { name: 'Converted',      count: converted, rate: (activeTrial+converted+expired) ? Math.round(converted/(activeTrial+converted+expired)*100) : 0 },
    ],
    dropOff: {
      atPendingApproval: pendingApproval,
      atExpiredTrial: expired,
    },
    conversionRate: approved ? Math.round(converted/approved*100) : 0,
  };

  await cacheSet('platform:analytics:funnel', JSON.stringify(funnel), 1800); // 30 min
  return funnel;
}
```

### 12.3 Platform Analytics Cron Jobs

```typescript
// Refresh platform analytics cache every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    await cacheDel('platform:analytics:overview');
    await getPlatformOverview(); // pre-warm cache
  } catch (err) {
    logger.error({ err }, 'Platform analytics cache refresh failed');
  }
}, { timezone: 'UTC' });

// Refresh MRR breakdown hourly
cron.schedule('0 * * * *', async () => {
  await cacheDel('platform:analytics:mrr');
  // MRR is recomputed on next request
}, { timezone: 'UTC' });
```

---

## 13. Database Migration Strategy

### 13.1 Migration Overview

```
Current State:
  - Single "default" tenant
  - No Organization model
  - User.role ∈ {SUPERADMIN, ADMIN, PROJECT_MANAGER, CONTRIBUTOR, CLIENT}
  - All collections: no organizationId field
  - S3 keys: no org prefix

Target State:
  - Organization model with 1 default org (containing all existing data)
  - User.orgRole replaces User.role
  - All collections: organizationId required
  - S3 keys: organizations/{defaultOrgId}/...
```

### 13.2 Migration Script — Phase 1: Create Default Organization

```typescript
// scripts/migrations/001_create_default_org.ts

import mongoose from 'mongoose';
import { Organization } from '../../src/models/Organization';
import { User } from '../../src/models/User';
import { connectDB } from '../../src/config/db';
import { logger } from '../../src/lib/logger';

async function migrateToMultiTenant() {
  await connectDB();
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      logger.info('Step 1: Creating default organization...');

      // Find the SUPERADMIN to use as org owner
      const superadmin = await User.findOne({ role: 'SUPERADMIN' }).lean();
      if (!superadmin) throw new Error('No SUPERADMIN found — cannot determine org owner');

      // ── Create default Organization ──────────────────────────────────
      const defaultOrg = await Organization.create([{
        name: process.env.AGENCY_NAME ?? 'Default Agency',
        slug: 'default-agency',
        status: 'ACTIVE',
        plan: 'ENTERPRISE',  // give existing agency enterprise plan
        ownerEmail: superadmin.email,
        registeredAt: superadmin.createdAt ?? new Date(),
        approvedAt: new Date(),
        trialStartsAt: null,
        trialEndsAt: null,
        expiresAt: null,    // no expiry for migrated org
        limits: {
          seats: -1,
          storageBytes: 1000 * 1024 * 1024 * 1024,   // 1TB
          projects: -1,
          clients: -1,
          automations: -1,
        },
        usage: { seats: 0, storageUsedBytes: 0, projects: 0, clients: 0 },
        features: {
          contractModule: true,
          invoiceModule: true,
          automationsModule: true,
          analyticsModule: true,
          apiAccess: true,
          whiteLabel: true,
          customDomain: true,
          ssoEnabled: false,
        },
      }], { session });

      const orgId = defaultOrg[0]._id;
      logger.info({ orgId }, 'Default organization created');

      // ── Step 2: Migrate Users ─────────────────────────────────────────
      logger.info('Step 2: Migrating users...');

      const roleMapping: Record<string, string> = {
        'SUPERADMIN': 'ORGANIZATION_OWNER',
        'ADMIN': 'ORGANIZATION_ADMIN',
        'PROJECT_MANAGER': 'PROJECT_MANAGER',
        'CONTRIBUTOR': 'CONTRIBUTOR',
        'CLIENT': 'CLIENT',
      };

      const users = await User.find({}).lean();
      logger.info({ count: users.length }, 'Users to migrate');

      for (const user of users) {
        const orgRole = roleMapping[user.role] ?? 'CONTRIBUTOR';
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              organizationId: orgId,
              orgRole,
            },
            $unset: { role: '' },  // remove old role field
          },
          { session }
        );
      }

      // Update org seat usage
      await Organization.updateOne(
        { _id: orgId },
        { 'usage.seats': users.length },
        { session }
      );

      logger.info('Users migrated');

      // ── Step 3: Migrate Projects ──────────────────────────────────────
      logger.info('Step 3: Migrating projects...');
      const projectCount = await mongoose.connection.collection('projects').countDocuments();
      await mongoose.connection.collection('projects').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );
      logger.info({ count: projectCount }, 'Projects migrated');

      // ── Step 4: Migrate Tasks ─────────────────────────────────────────
      logger.info('Step 4: Migrating tasks...');
      await mongoose.connection.collection('tasks').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );

      // ── Step 5: Migrate Clients ───────────────────────────────────────
      logger.info('Step 5: Migrating clients...');
      const clients = await mongoose.connection.collection('clients').find({}).toArray();
      await mongoose.connection.collection('clients').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );

      // Update org client usage count
      await Organization.updateOne(
        { _id: orgId },
        { 'usage.clients': clients.length },
        { session }
      );

      // ── Step 6: Migrate Invoices ──────────────────────────────────────
      logger.info('Step 6: Migrating invoices...');
      await mongoose.connection.collection('invoices').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );

      // ── Step 7: Migrate Contracts + Templates ─────────────────────────
      logger.info('Step 7: Migrating contracts...');
      await mongoose.connection.collection('contracts').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );
      await mongoose.connection.collection('contracttemplates').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );

      // ── Step 8: Migrate Files ─────────────────────────────────────────
      logger.info('Step 8: Migrating files...');
      await mongoose.connection.collection('files').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );

      // ── Step 9: Migrate Messages + Channels ──────────────────────────
      logger.info('Step 9: Migrating messages and channels...');
      await mongoose.connection.collection('messages').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );
      await mongoose.connection.collection('channels').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );

      // ── Step 10: Migrate Notifications ───────────────────────────────
      logger.info('Step 10: Migrating notifications...');
      await mongoose.connection.collection('notifications').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );

      // ── Step 11: Migrate Automations ──────────────────────────────────
      logger.info('Step 11: Migrating automation rules...');
      await mongoose.connection.collection('automationrules').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );

      // ── Step 12: Migrate Audit Logs ───────────────────────────────────
      logger.info('Step 12: Migrating audit logs...');
      await mongoose.connection.collection('auditlogs').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId, isPlatformAction: false } },
        { session }
      );

      // ── Step 13: Migrate Approvals + Briefs ───────────────────────────
      logger.info('Step 13: Migrating approvals and briefs...');
      await mongoose.connection.collection('approvals').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );
      await mongoose.connection.collection('briefs').updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: orgId } },
        { session }
      );

      // ── Step 14: Update project usage count on org ────────────────────
      const projectCountFinal = await mongoose.connection
        .collection('projects')
        .countDocuments({ organizationId: orgId });
      await Organization.updateOne(
        { _id: orgId },
        { 'usage.projects': projectCountFinal },
        { session }
      );

      logger.info({ orgId }, 'Migration transaction completed successfully');
    });

    logger.info('✅ Multi-tenant migration complete');
  } catch (err) {
    logger.error({ err }, '❌ Migration failed — transaction rolled back');
    throw err;
  } finally {
    await session.endSession();
    await mongoose.disconnect();
  }
}

migrateToMultiTenant().catch(err => {
  console.error(err);
  process.exit(1);
});
```

### 13.3 Migration Script — Phase 2: Create Compound Indexes

```typescript
// scripts/migrations/002_create_indexes.ts

import mongoose from 'mongoose';

async function createIndexes() {
  await connectDB();
  const db = mongoose.connection.db;

  // Drop old single-field indexes that are now superseded
  const dropOldIndexes = [
    { collection: 'users', index: 'email_1' },          // replaced by organizationId+email
    { collection: 'projects', index: 'slug_1' },        // replaced by organizationId+slug
    { collection: 'clients', index: 'slug_1' },         // replaced by organizationId+slug
    { collection: 'invoices', index: 'invoiceNumber_1' }, // replaced by org+invoiceNumber
  ];

  for (const { collection, index } of dropOldIndexes) {
    try {
      await db.collection(collection).dropIndex(index);
      logger.info({ collection, index }, 'Dropped old index');
    } catch (err) {
      logger.warn({ collection, index, err }, 'Could not drop index (may not exist)');
    }
  }

  // Create new compound indexes
  const newIndexes = [
    { col: 'users', idx: { organizationId: 1, email: 1 }, opts: { unique: true } },
    { col: 'users', idx: { organizationId: 1, orgRole: 1, isActive: 1 } },
    { col: 'projects', idx: { organizationId: 1, status: 1, createdAt: -1 } },
    { col: 'projects', idx: { organizationId: 1, clientId: 1 } },
    { col: 'projects', idx: { organizationId: 1, slug: 1 }, opts: { unique: true } },
    { col: 'tasks', idx: { organizationId: 1, projectId: 1, status: 1 } },
    { col: 'tasks', idx: { organizationId: 1, projectId: 1, assignees: 1 } },
    { col: 'clients', idx: { organizationId: 1, slug: 1 }, opts: { unique: true } },
    { col: 'clients', idx: { organizationId: 1, status: 1 } },
    { col: 'invoices', idx: { organizationId: 1, invoiceNumber: 1 }, opts: { unique: true } },
    { col: 'invoices', idx: { organizationId: 1, status: 1, dueDate: 1 } },
    { col: 'invoices', idx: { organizationId: 1, clientId: 1 } },
    { col: 'files', idx: { organizationId: 1, projectId: 1 } },
    { col: 'messages', idx: { organizationId: 1, channelId: 1, createdAt: -1 } },
    { col: 'notifications', idx: { organizationId: 1, userId: 1, isRead: 1 } },
    { col: 'automationrules', idx: { organizationId: 1, isActive: 1, 'trigger.event': 1 } },
    { col: 'auditlogs', idx: { organizationId: 1, resource: 1, createdAt: -1 } },
    { col: 'contracts', idx: { organizationId: 1, status: 1 } },
    { col: 'approvals', idx: { organizationId: 1, projectId: 1, status: 1 } },
    { col: 'channels', idx: { organizationId: 1, projectId: 1 } },
    // Organizations collection
    { col: 'organizations', idx: { status: 1, plan: 1 } },
    { col: 'organizations', idx: { trialEndsAt: 1 }, opts: { sparse: true } },
    { col: 'organizations', idx: { stripeCustomerId: 1 }, opts: { sparse: true } },
    { col: 'organizations', idx: { ownerEmail: 1 } },
  ];

  for (const { col, idx, opts } of newIndexes) {
    await db.collection(col).createIndex(idx, opts ?? {});
    logger.info({ collection: col, index: idx }, 'Created index');
  }

  logger.info('✅ Index migration complete');
  await mongoose.disconnect();
}
```

### 13.4 S3 Key Migration (Background Job)

```typescript
// scripts/migrations/003_migrate_storage_keys.ts
// NOTE: This script runs AFTER the DB migration and is low-priority / async
// It migrates existing S3 keys to org-namespaced paths

async function migrateStorageKeys(orgId: string) {
  const files = await File.find({ organizationId: orgId }).lean();
  logger.info({ count: files.length, orgId }, 'Migrating storage keys');

  for (const file of files) {
    const oldKey = file.storageKey;

    // Skip if already migrated (starts with organizations/)
    if (oldKey.startsWith('organizations/')) continue;

    const newKey = `organizations/${orgId}/projects/${file.projectId}/files/${Date.now()}-${file.originalName}`;

    // Copy in S3 (not move — preserves original)
    await s3Client.copyObject({
      Bucket: env.S3_BUCKET,
      CopySource: `${env.S3_BUCKET}/${oldKey}`,
      Key: newKey,
      ServerSideEncryption: 'AES256',
    });

    // Update DB record
    await File.updateOne({ _id: file._id }, { storageKey: newKey });

    // Delete old key after confirming new key works
    // (run deletion in a separate pass after verification)
  }

  logger.info({ orgId }, 'Storage key migration complete');
}
```

### 13.5 Zero-Downtime Deployment Strategy

```
Phase A — Backward-Compatible Release (Deploy First)
  ✅ All new schema fields have defaults or are optional
  ✅ New Organization model is additive
  ✅ authenticate.ts reads organizationId if present (backward-compat)
  ✅ tenantScope middleware is NOT yet applied to existing routes
  ✅ All queries still work without organizationId filter (fallback)

Phase B — Run Migration Script
  ✅ Migration runs against live DB in a transaction
  ✅ All documents get organizationId = defaultOrgId
  ✅ Duration: ~1-5 minutes depending on document count
  ✅ App continues serving requests (reads fallback to no-org-filter during migration)

Phase C — Apply Indexes (Background)
  ✅ Use createIndex() with background:true (Mongoose default)
  ✅ Indexes build without blocking writes
  ✅ Duration: depends on collection size

Phase D — Enable Tenant Scoping (Second Release)
  ✅ tenantScope() middleware enabled on all routes
  ✅ JWT now requires organizationId (new tokens include it)
  ✅ Old tokens without organizationId: 401 (users must log in again)
  ✅ S3 upload code generates org-prefixed keys
  ✅ Socket.io rooms updated

Phase E — S3 Key Migration (Background)
  ✅ Run migration script in background (async, low priority)
  ✅ New uploads use new keys immediately
  ✅ Old files: serve old keys until migration completes
  ✅ After migration: delete old S3 keys (verify integrity first)
```

### 13.6 Rollback Plan

```
If Phase B (migration) fails:
  → Transaction is rolled back automatically
  → No data was modified
  → Revert to previous code release (Phase A)
  → Root cause → fix → retry

If Phase D (scoping) fails:
  → Revert second release to Phase A code
  → Auth tokens still valid (no org scoping enforced)
  → DB data remains migrated (organizationId fields present)
  → Root cause → fix → re-release Phase D

If Phase E (S3 migration) fails:
  → Old S3 keys remain valid and accessible
  → New uploads use new key format
  → Retry S3 migration at lower throughput
  → No user-visible impact

Rollback Checklist:
  [ ] Revert to previous Git tag
  [ ] Clear Redis cache (redis-cli FLUSHDB — non-production only; for prod: selective key deletion)
  [ ] Verify health endpoint returns 200
  [ ] Verify login works for existing users
  [ ] Verify SUPERADMIN dashboard accessible
```

---

## 14. Security Impact Analysis

### 14.1 Tenant Isolation Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Cross-tenant data access via unscoped query | **CRITICAL** | Every service query starts with `organizationId` filter (first position in compound index) |
| Tenant ID spoofing via JWT manipulation | **CRITICAL** | JWT signed with `JWT_ACCESS_SECRET` (≥32 chars); `organizationId` in payload not in headers |
| Cross-tenant file download via StorageKey | **HIGH** | `validateStorageKeyOwnership()` on every signed URL generation |
| Cross-tenant socket room injection | **HIGH** | `join:project` validates `{ _id, organizationId }` before allowing room join |
| Session fixation after org suspension | **HIGH** | `invalidateOrgSessions()` bulk-revokes all sessions on suspend |
| Redis key collision between orgs | **MEDIUM** | All keys prefixed with `org:{orgId}:` — globally unique per org |
| Impersonation token abuse | **HIGH** | Time-limited (1h), scoped to single org, full audit trail, revocable |
| Registration flood / org enumeration | **MEDIUM** | Registration rate limit (3/IP/hour), slug availability check doesn't reveal org details |
| User email reuse across orgs | **LOW** | Email unique per `(organizationId, email)` compound — same email CAN exist in multiple orgs |

### 14.2 JWT Security Updates

```typescript
// New JWT access token MUST include:
// - organizationId: prevents token reuse across orgs
// - isPlatformUser: boolean — prevents org user from claiming platform role
// - type: 'access' — prevents refresh token from being used as access token

// Validation in authenticate.ts:
// 1. Verify signature with JWT_ACCESS_SECRET
// 2. Verify type === 'access'
// 3. If !isPlatformUser: verify organizationId is present
// 4. If !isPlatformUser: verify org is ACTIVE (via tenantScope)
// 5. Check Redis revocation list

// Key rotation strategy:
// - Use PLATFORM_JWT_ACCESS_SECRET separate from JWT_ACCESS_SECRET
// - Rotate secrets via environment variable update + rolling redeploy
// - Old tokens expire in 15m; no forced logout needed
// - Refresh tokens (7d) must be explicitly revoked on secret rotation
//   → Run: redis-cli --scan --pattern 'refresh:*' | xargs redis-cli del
```

### 14.3 Organization Spoofing Prevention

```typescript
// The organizationId in the JWT payload is set at login time
// from the User's organizationId field in MongoDB.
// It CANNOT be changed by the client.

// Additional protections:
// 1. tenantScope() validates org exists AND is ACTIVE on every request
// 2. Resource queries always include { organizationId: req.user.organizationId }
// 3. Resource creation always sets organizationId from req.user (never from req.body)
// 4. Cross-org references are validated (e.g. clientId must be in same org)

// NEVER allow organizationId in request body for create operations:
// WRONG:
const project = await Project.create({ ...req.body }); // could contain any orgId

// CORRECT:
const project = await Project.create({
  ...req.body,
  organizationId: req.user.organizationId, // always from authenticated user
  createdBy: req.user.id,
});
```

### 14.4 Cross-Tenant Injection Risks

```typescript
// MongoDB NoSQL injection via $or, $in queries:
// Risk: attacker supplies { "$or": [{ "organizationId": "other-org" }] }

// Mitigation (already in app.ts via express-mongo-sanitize):
app.use(mongoSanitize()); // strips $ and . from req.body/query/params

// Additional: always use { organizationId: trustedOrgId, ...untrustedFilter }
// The trusted organizationId is always the FIRST condition in the query object
// MongoDB evaluates left-to-right; the org filter eliminates cross-tenant docs
// before any user-supplied filter conditions are applied.

// Zod validation on all body parameters also prevents injection via validation schemas.
```

### 14.5 Redis Poisoning Risks

```typescript
// Risk: If Redis keys are predictable, an attacker might set a key
// to poison another user's cache.

// Mitigations:
// 1. Redis is not publicly accessible (private network / VPC only)
// 2. All cache keys are based on MongoDB ObjectIds (not user-supplied strings)
// 3. Cache values are validated before use (type-checked JSON parse)
// 4. Auth tokens are hashed (SHA-256) before storage — raw tokens never in Redis
// 5. Org cache invalidation uses exact key deletion, not pattern-based
// 6. Redis AUTH password enforced in production (REDIS_URL includes password)

// The existing codebase already follows the correct pattern:
// refresh token stored as SHA-256 hash, not the token itself
```

### 14.6 Existing Security Issues to Fix During Migration

These are carried over from the security audit in `DOCUMENTATION.md` Section 15:

```typescript
// FIX 1 (HIGH): Hardcoded encryption key — MUST be fixed before multi-tenant launch
// lib/crypto.ts: getEncryptionKey() falls back to 'default-encryption-key-32-chars!!'
// Action: Enforce ENCRYPTION_KEY in env.ts as required field:
ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters').nonempty(),
// Remove the fallback entirely.

// FIX 2 (MEDIUM): Virus scan is a stub
// In a multi-tenant environment, a compromised file from Org A could affect others
// if stored on shared infrastructure. Implement real ClamAV or AWS Malware Protection.

// FIX 3 (MEDIUM): No CSRF protection
// With multi-tenant cookies, CSRF risk increases. Implement double-submit cookie pattern.

// FIX 4 (LOW → HIGH in multi-tenant): Redis adapter for Socket.io
// Without the Redis adapter, multi-instance deployments will NOT correctly route
// Socket.io events across instances. This is now CRITICAL for horizontal scaling.
// FIX: io.adapter(createAdapter(pubClient, subClient)); — see Section 9.5

// FIX 5 (MEDIUM): bootstrap-superadmin endpoint must be removed or replaced
// The current endpoint creates a global SUPERADMIN with no org context.
// Replace with a platform user bootstrap endpoint in /api/platform/auth/bootstrap
// Protected by: NODE_ENV !== 'production' OR one-time secret token
```

---

## 15. Implementation Roadmap

### Phase 1 — Foundation (Weeks 1–2) | Complexity: HIGH

**Goal:** Add Organization model and migration infrastructure without breaking existing functionality.

**Tasks:**
- [ ] Create `Organization` Mongoose model with all fields and indexes
- [ ] Create `PlatformUser` Mongoose model
- [ ] Add `organizationId` + `orgRole` fields to `User` model (optional, with defaults)
- [ ] Add `organizationId` to all 14 other models (optional, no indexes yet)
- [ ] Write and test migration script `001_create_default_org.ts` against staging DB
- [ ] Update `config/env.ts` to add all new required env vars
- [ ] Create `lib/platformJwt.ts` with separate signing/verification functions
- [ ] Update `types/express.d.ts` with new User shape

**Dependencies:** None  
**Risks:** Migration script data loss on production. Run on staging first.  
**Testing:** Unit tests for migration script idempotency (run twice → same result)

---

### Phase 2 — Auth & RBAC Overhaul (Weeks 2–3) | Complexity: HIGH

**Goal:** Update authentication and authorization to be org-aware.

**Tasks:**
- [ ] Update `lib/jwt.ts` to include `organizationId`, `orgRole`, `isPlatformUser` in payload
- [ ] Update `authenticate.ts` to set new `req.user` shape
- [ ] Create `middleware/authenticatePlatform.ts`
- [ ] Rewrite `middleware/authorize.ts` with new RBAC matrix
- [ ] Create `middleware/tenantScope.ts`
- [ ] Update `middleware/auditLog.ts` to include `organizationId` in audit entries
- [ ] Remove/replace `bootstrap-superadmin` endpoint
- [ ] Add `POST /api/platform/auth/bootstrap` (one-time platform owner setup)
- [ ] Update `lib/passport.ts` Google OAuth to assign org context

**Dependencies:** Phase 1 complete  
**Risks:** All existing sessions become invalid (new JWT shape). Coordinate with frontend team for forced re-login.  
**Testing:** Auth integration tests for all 5 org roles + 3 platform roles. Test cross-tenant access denial.

---

### Phase 3 — Route & Service Scoping (Weeks 3–5) | Complexity: VERY HIGH

**Goal:** Add `organizationId` filter to every service function and mount `tenantScope` on all routes.

**Tasks (by module):**
- [ ] `clients.service.ts` — all queries org-scoped
- [ ] `projects.service.ts` — all queries org-scoped; update role-based scoping logic
- [ ] `tasks.service.ts` — all queries org-scoped
- [ ] `files.service.ts` — all queries org-scoped; update storage key generation
- [ ] `messages.service.ts` — all queries org-scoped
- [ ] `invoices.service.ts` — all queries org-scoped; update invoice number generation per-org
- [ ] `contracts.service.ts` — all queries org-scoped
- [ ] `approvals.service.ts` — all queries org-scoped
- [ ] `notifications.service.ts` — all queries org-scoped
- [ ] `automations.service.ts` — all queries org-scoped
- [ ] `analytics.service.ts` — all queries org-scoped
- [ ] `admin.routes.ts` — scope to org admin (not platform admin)
- [ ] Mount `tenantScope` middleware after `authenticate` on all `/api/v1/` routes
- [ ] Update `invoiceNumber` generation to be per-org (count within org)
- [ ] Update `slug` generation to be per-org (uniqueness within org)
- [ ] Add `organizationId` to all create operations from `req.user.organizationId`

**Dependencies:** Phase 2 complete  
**Risks:** Any query missing `organizationId` filter is a cross-tenant data leak. Code review required.  
**Testing:** Integration tests verifying that User A from Org A cannot access any data from Org B.

---

### Phase 4 — Platform Admin Module (Weeks 5–6) | Complexity: HIGH

**Goal:** Build the full platform administration layer.

**Tasks:**
- [ ] Create `src/modules/platform/` module directory
- [ ] `platform/auth/` — login, refresh, logout for platform users
- [ ] `platform/organizations/` — CRUD, approve, reject, suspend, reactivate
- [ ] `platform/impersonation/` — start/stop impersonation
- [ ] `platform/analytics/` — platform-wide metrics
- [ ] `platform/users/` — manage platform users
- [ ] `platform/flags/` — feature flag management
- [ ] `platform/billing/` — Stripe subscription management
- [ ] Mount `/api/platform/` in `app.ts` with `authenticatePlatform` middleware
- [ ] Implement audit logging for all platform actions

**Dependencies:** Phase 2 complete  
**Risks:** Impersonation security — extensive security review required  
**Testing:** Security tests: impersonation cannot access billing:write, cannot access /api/platform/, expires after 1h

---

### Phase 5 — Organization Registration & Trial System (Weeks 6–7) | Complexity: HIGH

**Goal:** Public organization registration, approval queue, and trial lifecycle.

**Tasks:**
- [ ] Create `src/modules/organizations/` module
- [ ] Implement `registerOrganization()` service
- [ ] Implement approval/rejection/suspension service functions
- [ ] Create `src/workers/trialLifecycleJobs.ts` with all 6 cron jobs
- [ ] Update `scheduledJobs.ts` to import new jobs
- [ ] Stripe webhook handlers for subscription lifecycle events
- [ ] Feature flag enforcement middleware (`requireFeature()`)
- [ ] Organization usage limit enforcement (seats, storage, projects)
- [ ] Ownership transfer endpoint
- [ ] Organization deletion request flow

**Dependencies:** Phases 3 & 4 complete  
**Risks:** Stripe webhook security — verify signature on every event  
**Testing:** Full lifecycle test: register → approve → trial → expire → subscribe

---

### Phase 6 — Email Lifecycle System (Week 7) | Complexity: MEDIUM

**Goal:** Build the complete org onboarding email system.

**Tasks:**
- [ ] Create `src/lib/emailTemplates/` directory structure
- [ ] Implement `renderEmailTemplate()` dispatcher
- [ ] Create all 30+ email templates (HTML)
- [ ] Update `emailWorker.ts` for scheduled emails, template-based rendering
- [ ] Implement `enqueueEmail()` helper used across all modules
- [ ] Add org branding to email template context
- [ ] Implement transactional vs. marketing email tagging
- [ ] Test all email flows end-to-end

**Dependencies:** Phase 5 complete  
**Risks:** SMTP rate limits at scale. Consider SendGrid/Postmark for production  
**Testing:** Email delivery tests for all 30+ template types with mock SMTP

---

### Phase 7 — Socket.io & Redis Overhaul (Week 8) | Complexity: HIGH

**Goal:** Multi-tenant Socket.io with Redis adapter and org-namespaced cache keys.

**Tasks:**
- [ ] Rewrite `sockets/socketServer.ts` with org-prefixed rooms
- [ ] Enable `@socket.io/redis-adapter` (already installed, not wired)
- [ ] Update all `io.to().emit()` calls in services to use `emitToProject/User/Org` helpers
- [ ] Rename all Redis cache keys to org-namespaced format
- [ ] Implement `orgCacheGet/Set/Del` helpers
- [ ] Implement `CacheGroups` invalidation groups
- [ ] Implement `invalidateOrgSessions()` for bulk session revocation
- [ ] Add org-level API rate limiter (`orgApiLimiter` middleware)
- [ ] Update `authenticate.ts` to track sessions in `org:sessions:{orgId}` SET

**Dependencies:** Phases 3 & 5 complete  
**Risks:** Redis adapter not tested under load. Run load test before production  
**Testing:** Multi-instance Socket.io test: connect to instance A, emit event from instance B, verify receipt

---

### Phase 8 — Storage Isolation (Week 8–9) | Complexity: MEDIUM

**Goal:** Org-scoped S3/R2 keys and storage quota enforcement.

**Tasks:**
- [ ] Update `config/storage.ts` with org-scoped key generation functions
- [ ] Update `files.service.ts` to use `generateProjectFileKey()`
- [ ] Update `files.service.ts` to check and update org storage quota
- [ ] Add `validateStorageKeyOwnership()` to all signed URL generation
- [ ] Run `003_migrate_storage_keys.ts` in background
- [ ] Add daily storage reconciliation cron job
- [ ] Update `getFileVersions()` to add pagination (fixes existing bug)

**Dependencies:** Phase 3 complete  
**Risks:** S3 key migration could fail for large orgs. Run incrementally with checkpointing  
**Testing:** Verify org A cannot download org B's files via storage key manipulation

---

### Phase 9 — Platform Analytics (Week 9) | Complexity: MEDIUM

**Goal:** Global platform analytics dashboard.

**Tasks:**
- [ ] Implement `platformAnalytics.service.ts`
- [ ] Implement `getPlatformOverview()`, `getOnboardingFunnel()`, `getMrrTrend()`
- [ ] Add platform analytics routes in `/api/platform/analytics/`
- [ ] Add cron jobs for analytics cache refresh
- [ ] Implement storage usage aggregation
- [ ] Implement org activity ranking

**Dependencies:** Phase 4 complete  
**Risks:** Large aggregations may be slow at scale. Add query timeouts  
**Testing:** Unit tests for all aggregation functions with seeded data

---

### Phase 10 — Hardening, Testing & Launch (Weeks 10–12) | Complexity: HIGH

**Goal:** Security hardening, load testing, documentation, production launch.

**Tasks:**
- [ ] Fix all 10 security issues from DOCUMENTATION.md Section 16
- [ ] Fix critical: remove hardcoded ENCRYPTION_KEY fallback (required before launch)
- [ ] Implement real virus scanning (ClamAV or AWS Malware Protection)
- [ ] Add CSRF protection (double-submit cookie)
- [ ] Add HPP middleware (installed but unused)
- [ ] Add rate limit to Stripe webhook endpoint
- [ ] Implement `CHANGE_STATUS` and `SEND_INVOICE` automation actions
- [ ] Add pagination to `getFileVersions()`
- [ ] Remove duplicate `dev-set-password` route
- [ ] Full integration test suite for all 10 modules × multi-tenant
- [ ] Load test: 100 concurrent orgs, 1000 req/s
- [ ] Security penetration test: cross-tenant access attempts
- [ ] Run production migration on staging environment
- [ ] Deploy Phase A (backward-compatible) to production
- [ ] Run migration scripts in off-peak window
- [ ] Deploy Phase D (tenant scoping) to production
- [ ] Monitor error rates and Redis hit rates post-deployment

**Dependencies:** All previous phases  
**Risks:** Migration on production data  
**Testing:** Complete E2E test suite covering all org lifecycle states

---

## 16. New Directory Structure

```
backend/src/
├── app.ts
├── server.ts
│
├── config/
│   ├── bullRedis.ts
│   ├── db.ts
│   ├── env.ts                         # ADD: PLATFORM_JWT_ACCESS_SECRET, etc.
│   ├── redis.ts                       # ADD: orgCacheGet/Set/Del, pub/subClient exports
│   └── storage.ts                     # ADD: generateOrgStorageKey, validateOwnership
│
├── lib/
│   ├── crypto.ts                      # FIX: remove hardcoded key fallback
│   ├── email.ts                       # KEEP: transport setup
│   ├── emailTemplates/                # NEW: template system
│   │   ├── index.ts
│   │   ├── base/layout.ts
│   │   ├── org/*.ts                   # ~10 templates
│   │   ├── platform/*.ts              # ~2 templates
│   │   ├── team/*.ts
│   │   ├── client/*.ts
│   │   ├── auth/*.ts
│   │   ├── invoice/*.ts
│   │   ├── contract/*.ts
│   │   └── approval/*.ts
│   ├── errors.ts
│   ├── frontendUrl.ts
│   ├── jwt.ts                         # UPDATE: add orgId, orgRole, isPlatformUser
│   ├── platformJwt.ts                 # NEW: platform JWT sign/verify
│   ├── logger.ts
│   ├── passport.ts                    # UPDATE: assign organizationId on OAuth
│   ├── pdf.ts
│   ├── stripe.ts                      # UPDATE: subscription lifecycle handlers
│   └── cacheInvalidation.ts           # NEW: CacheGroups, invalidateCache
│
├── middleware/
│   ├── auditLog.ts                    # UPDATE: include organizationId
│   ├── authenticate.ts                # UPDATE: new req.user shape
│   ├── authenticatePlatform.ts        # NEW: platform user auth
│   ├── authorize.ts                   # REWRITE: new RBAC matrix
│   ├── tenantScope.ts                 # NEW: org validation + req.tenantFilter
│   ├── errorHandler.ts
│   ├── rateLimiter.ts                 # UPDATE: add orgApiLimiter, orgRegistrationLimiter
│   ├── requestId.ts
│   └── validate.ts
│
├── models/
│   ├── Organization.ts                # NEW
│   ├── PlatformUser.ts                # NEW
│   ├── Approval.ts                    # UPDATE: + organizationId
│   ├── AuditLog.ts                    # UPDATE: + organizationId, isPlatformAction
│   ├── AutomationRule.ts              # UPDATE: + organizationId
│   ├── Brief.ts                       # UPDATE: + organizationId
│   ├── Channel.ts                     # UPDATE: + organizationId
│   ├── Client.ts                      # UPDATE: + organizationId, slug per-org unique
│   ├── Contract.ts                    # UPDATE: + organizationId
│   ├── ContractTemplate.ts            # UPDATE: + organizationId
│   ├── File.ts                        # UPDATE: + organizationId
│   ├── Invoice.ts                     # UPDATE: + organizationId, invoiceNumber per-org
│   ├── Message.ts                     # UPDATE: + organizationId
│   ├── Notification.ts                # UPDATE: + organizationId
│   ├── Project.ts                     # UPDATE: + organizationId, slug per-org unique
│   ├── Task.ts                        # UPDATE: + organizationId
│   └── User.ts                        # UPDATE: + organizationId, orgRole; remove role
│
├── modules/
│   ├── admin/                         # UPDATE: scoped to org admin
│   ├── analytics/                     # UPDATE: org-scoped
│   ├── approvals/                     # UPDATE: org-scoped
│   ├── auth/                          # UPDATE: new JWT payload
│   ├── automations/                   # UPDATE: org-scoped
│   ├── clients/                       # UPDATE: org-scoped
│   ├── contracts/                     # UPDATE: org-scoped
│   ├── files/                         # UPDATE: org-scoped storage
│   ├── invoices/                      # UPDATE: org-scoped, Stripe sub webhooks
│   ├── messages/                      # UPDATE: org-scoped
│   ├── notifications/                 # UPDATE: org-scoped
│   ├── organizations/                 # NEW: registration, org management
│   │   ├── organizations.routes.ts
│   │   ├── organizations.controller.ts
│   │   ├── organizations.service.ts
│   │   └── organizations.schemas.ts
│   ├── platform/                      # NEW: platform admin
│   │   ├── auth/
│   │   ├── organizations/
│   │   ├── impersonation/
│   │   ├── analytics/
│   │   ├── users/
│   │   ├── flags/
│   │   └── billing/
│   ├── projects/                      # UPDATE: org-scoped
│   └── tasks/                         # UPDATE: org-scoped
│
├── sockets/
│   └── socketServer.ts                # REWRITE: org rooms, Redis adapter
│
├── types/
│   └── express.d.ts                   # REWRITE: new User shape
│
└── workers/
    ├── emailWorker.ts                 # UPDATE: template-based, scheduled emails
    ├── invoiceWorker.ts               # UPDATE: org context in job
    ├── scanWorker.ts                  # UPDATE: real ClamAV integration
    ├── trialLifecycleJobs.ts          # NEW: trial expiry cron jobs
    └── scheduledJobs.ts               # UPDATE: import new jobs, add org context
```

---

## 17. Environment Variable Changes

```bash
# ── EXISTING (no change) ──────────────────────────────────────────────
MONGODB_URI=
JWT_ACCESS_SECRET=            # ≥32 chars
JWT_REFRESH_SECRET=           # ≥32 chars
REDIS_URL=
FRONTEND_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET=
R2_ENDPOINT=                  # if using Cloudflare R2
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
AGENCY_NAME=
ENCRYPTION_KEY=               # NOW REQUIRED (was optional with dangerous fallback)
VIRUS_SCAN_ENABLED=

# ── NEW — Platform Layer ────────────────────────────────────────────────
PLATFORM_JWT_ACCESS_SECRET=   # ≥32 chars — SEPARATE from JWT_ACCESS_SECRET
PLATFORM_JWT_REFRESH_SECRET=  # ≥32 chars
PLATFORM_ADMIN_EMAIL=         # First platform owner email (bootstrap)
PLATFORM_ADMIN_PASSWORD=      # First platform owner password (bootstrap, min 16 chars)
SUPPORT_URL=                  # e.g. https://support.agencyos.io

# ── NEW — Trial & Billing ────────────────────────────────────────────────
TRIAL_DAYS_DEFAULT=14
STRIPE_PRICE_STARTER_MONTHLY=
STRIPE_PRICE_STARTER_ANNUAL=
STRIPE_PRICE_GROWTH_MONTHLY=
STRIPE_PRICE_GROWTH_ANNUAL=
STRIPE_PRICE_ENTERPRISE_MONTHLY=
STRIPE_PRICE_ENTERPRISE_ANNUAL=

# ── NEW — Storage ────────────────────────────────────────────────────────
STORAGE_MIGRATION_MODE=false  # Set true during S3 key migration

# ── NEW — Feature Flags (global defaults) ────────────────────────────────
FEATURE_AUTOMATIONS_DEFAULT=false
FEATURE_API_ACCESS_DEFAULT=false
FEATURE_SSO_DEFAULT=false
```

---

## Implementation Checklist Summary

```
Phase 1 — Foundation
  [ ] Organization model
  [ ] PlatformUser model
  [ ] Add organizationId to all 15 models (optional fields)
  [ ] Migration script 001
  [ ] env.ts updates
  [ ] platformJwt.ts
  [ ] express.d.ts update

Phase 2 — Auth & RBAC
  [ ] jwt.ts update
  [ ] authenticate.ts update
  [ ] authenticatePlatform.ts
  [ ] authorize.ts rewrite
  [ ] tenantScope.ts
  [ ] auditLog.ts update
  [ ] Remove bootstrap-superadmin

Phase 3 — Service Scoping (13 services)
  [ ] All service functions org-scoped
  [ ] tenantScope mounted on all routes
  [ ] organizationId in all creates
  [ ] Per-org invoice numbers
  [ ] Per-org slugs

Phase 4 — Platform Admin (7 sub-modules)
  [ ] platform/auth
  [ ] platform/organizations
  [ ] platform/impersonation
  [ ] platform/analytics
  [ ] platform/users
  [ ] platform/flags
  [ ] platform/billing

Phase 5 — Org Lifecycle
  [ ] organizations module
  [ ] Registration API
  [ ] Approval workflow
  [ ] Trial cron jobs (6 jobs)
  [ ] Stripe subscription webhooks
  [ ] Ownership transfer
  [ ] Deletion safeguards

Phase 6 — Email System
  [ ] emailTemplates/ directory
  [ ] 30+ templates
  [ ] emailWorker update
  [ ] enqueueEmail helper

Phase 7 — Socket.io & Redis
  [ ] socketServer.ts rewrite
  [ ] Redis adapter enabled
  [ ] Org-namespaced cache keys
  [ ] CacheGroups invalidation
  [ ] Session bulk revocation
  [ ] orgApiLimiter

Phase 8 — Storage
  [ ] Org-scoped key generation
  [ ] Storage quota enforcement
  [ ] Storage key validation
  [ ] S3 migration script
  [ ] Reconciliation cron

Phase 9 — Platform Analytics
  [ ] platformAnalytics.service.ts
  [ ] Analytics routes
  [ ] Analytics cron jobs

Phase 10 — Hardening
  [ ] Fix ENCRYPTION_KEY (CRITICAL)
  [ ] Real virus scanning
  [ ] CSRF protection
  [ ] HPP middleware
  [ ] Stripe webhook rate limit
  [ ] Implement CHANGE_STATUS automation
  [ ] Implement SEND_INVOICE automation
  [ ] Paginate getFileVersions()
  [ ] Full test suite
  [ ] Load test
  [ ] Security penetration test
  [ ] Production migration
```

---

## 18. Critical Production-Grade Additions (Required Now)

The following systems are **required** for the first production-ready multi-tenant SaaS release. These are not optional enterprise luxuries — they directly affect production stability, tenant isolation, SaaS scalability, operational reliability, monetization, maintainability, and real-world usage.

Implement **all** of the following systems in detail.

---

### 18.1 Tenant Resolution Architecture (Critical)

The system currently introduces organizations but does NOT fully define how tenants are resolved. This is one of the most important architectural systems.

The backend MUST support:

- Slug-based tenancy
- Subdomain-based tenancy
- Future custom domains
- Tenant-aware routing
- Middleware-level organization resolution

**URL examples:**
- `app.agencyos.com/acme` (slug-based)
- `acme.agencyos.com` (subdomain-based)
- `portal.acme.com` (future custom domain)

**Explain in extreme detail:**

- Tenant resolution middleware
- Subdomain parsing
- Slug parsing
- Request lifecycle
- CDN considerations
- Proxy/load balancer behavior
- Local development strategy
- Fallback resolution logic
- Organization caching
- DNS strategy
- Wildcard subdomains
- Frontend tenant hydration
- SSR implications
- WebSocket tenant resolution
- API tenant resolution
- Org-aware cookies
- Security implications

**Generate:**

- Middleware examples
- Request flow diagrams
- Express middleware architecture
- Redis caching strategy
- Frontend routing examples
- Nginx examples
- Cloudflare examples

**Create:** `tenantResolver.ts`

Explain exactly where it fits into the middleware chain.

---

### 18.2 Organization Settings System

Create a complete `OrganizationSettings` architecture. Organizations need isolated, configurable settings.

**Include:**

- Branding
- Timezone
- Locale
- Notification defaults
- Invoice defaults
- Storage preferences
- Project defaults
- Security policies
- Session policies
- Feature preferences
- Email preferences
- Onboarding preferences

**Explain:**

- Schema design
- Inheritance strategy
- Defaults
- Validation
- Caching
- Frontend hydration
- Organization-specific overrides

**Generate:**

- Mongoose schema
- Validation schemas
- Caching strategy
- Update APIs
- Settings guards

---

### 18.3 API Key + Webhook System

Add a production-grade API integration system. Organizations must support API keys, integrations, external automations, inbound webhooks, and outbound webhooks.

**Create:**

- `ApiKey` model
- `WebhookEndpoint` model
- `WebhookDelivery` model

**Explain:**

- Key generation
- Hashing strategy
- Permission scopes
- Org-scoped API authentication
- Webhook signing
- HMAC verification
- Retry system
- Delivery failure handling
- Rate limiting
- Audit logging
- Replay attack prevention

**Generate:**

- Middleware
- Redis rate limit strategy
- Retry queue architecture
- Webhook event structure
- Webhook delivery lifecycle
- API auth examples

---

### 18.4 Background Job Failure Strategy

The platform already uses Bull queues. Now implement a complete production-grade queue resilience system.

**Include:**

- Retries
- Dead-letter queues
- Poison job handling
- Idempotency
- Deduplication
- Failure monitoring
- Queue analytics
- Retry backoff
- Exponential retries
- Stalled job recovery

**Explain:**

- Architecture
- Worker lifecycle
- Queue separation
- Redis considerations
- Job recovery
- Queue observability
- Production debugging

**Generate:**

- Queue naming conventions
- Retry configurations
- Dead-letter flow diagrams
- Bull worker examples
- Monitoring architecture

---

### 18.5 Billing State Machine

The current Stripe integration is incomplete. Add a complete SaaS billing lifecycle state machine.

**States:**

- `TRIAL`
- `ACTIVE`
- `PAST_DUE`
- `GRACE_PERIOD`
- `PAYMENT_FAILED`
- `CANCELED`
- `SUSPENDED`

**Explain:**

- Lifecycle transitions
- Stripe webhook mapping
- Subscription synchronization
- Retry behavior
- Grace periods
- Downgrade handling
- Reactivation flow
- Trial conversion
- Failed payment recovery

**Generate:**

- Billing lifecycle diagrams
- Cron jobs
- Webhook flows
- Database schema additions
- Subscription event mapping
- Retry automation

---

### 18.6 Immutable Security Audit Logging

Upgrade the audit logging system into an enterprise-grade immutable audit system.

**Add categories:**

- `LOGIN_SUCCESS`
- `LOGIN_FAILURE`
- `PASSWORD_CHANGE`
- `PERMISSION_CHANGE`
- `IMPERSONATION_STARTED`
- `IMPERSONATION_ENDED`
- `DATA_EXPORT`
- `API_KEY_CREATED`
- `WEBHOOK_FAILED`
- `BILLING_CHANGED`
- `ORG_SETTINGS_CHANGED`

**Explain:**

- Append-only logging
- Tamper protection
- Retention strategy
- Org-level filtering
- Platform-level filtering
- Forensic tracing
- Security alerting

**Generate:**

- Audit event architecture
- Schemas
- Indexing
- Redis streaming considerations
- Monitoring hooks

---

### 18.7 Observability + Monitoring

Implement a production-grade observability layer.

**Include:**

- Request tracing
- Error monitoring
- Queue monitoring
- WebSocket monitoring
- API latency tracking
- Memory monitoring
- CPU monitoring
- Redis monitoring
- Mongo monitoring

**Minimum stack:**

- Sentry
- Structured logging
- Request correlation IDs

**Future-ready:**

- OpenTelemetry
- Prometheus
- Grafana

**Explain:**

- Monitoring architecture
- Log aggregation
- Alerting strategy
- Tracing lifecycle
- Request correlation
- Queue visibility
- Production debugging workflows

**Generate:**

- Logger architecture
- Middleware
- Tracing flow
- Monitoring dashboards
- Sentry integration examples

---

### 18.8 Frontend Multi-Tenant Architecture

The backend alone is not enough. Explain the required frontend architecture changes for multi-tenancy.

**Include:**

- Org-aware routing
- Tenant hydration
- Branding injection
- Subdomain routing
- Organization-aware auth
- Feature hydration
- Tenant-aware layouts
- Onboarding flows
- Billing flows
- Platform admin frontend separation

**Explain:**

- React architecture
- Next.js considerations
- Route guards
- Tenant resolution on frontend
- Auth persistence
- WebSocket auth
- Feature flags on frontend

**Generate:**

- Frontend architecture diagrams
- Routing examples
- Auth flow diagrams
- Org-aware state management examples

---

### 18.9 Organization Invitation System (Upgrade)

Upgrade the invitation system into a complete enterprise invitation flow.

**Add:**

- Pending invites
- Invite expiry
- Resend invite
- Role restrictions
- Invitation cancellation
- Temporary invites
- Invite analytics
- Invite acceptance tracking

**Explain:**

- Schemas
- Flows
- Security
- Email lifecycle
- Onboarding integration
- RBAC enforcement

**Generate:**

- Invitation state diagrams
- Invitation APIs
- Email templates
- Acceptance flows

---

### 18.10 Disaster Recovery + Backups

Implement a realistic disaster recovery strategy.

**Include:**

- Automated backups
- Mongo backups
- Redis persistence
- S3 versioning
- Restore procedures
- Soft deletes
- Recovery workflows
- Organization restore
- Backup retention policies

**Explain:**

- Backup schedules
- Restore timelines
- Recovery objectives
- Deployment rollback
- Ransomware mitigation
- Infrastructure recovery

**Generate:**

- Cron jobs
- Backup flow diagrams
- Recovery checklists
- Operational runbooks

---

### 18.11 Implementation Priority

These systems must be implemented in this exact priority order:

1. **Tenant Resolution Architecture** — nothing works correctly without knowing which tenant a request belongs to
2. **Organization Settings System** — every downstream feature (email, branding, billing) depends on org config
3. **Billing State Machine** — revenue protection; broken billing = broken business
4. **Queue Failure Strategy** — email delivery, webhooks, and billing events all flow through queues
5. **Frontend Multi-Tenant Routing** — users cannot access the product without correct org-aware routing
6. **API Keys + Webhooks** — enables external integrations and automation; a key revenue feature
7. **Observability + Monitoring** — required before scaling; production is blind without it
8. **Invitation System Upgrade** — team growth is blocked without a reliable invite flow
9. **Disaster Recovery + Backups** — data protection; non-negotiable before real customer data lands
10. **White Label / Custom Domains** — future-ready architecture only; implement foundation now, full rollout later

**Why this order matters:** Each system in the list is a dependency for the ones that follow. Tenant resolution must come first because every other system (auth, settings, billing, routing) must know *which tenant* a request belongs to before it can do anything correctly. Billing state machine comes before queues because queue jobs execute billing retry logic. Monitoring comes before scaling because you cannot safely grow traffic you cannot observe.

---

### 18.12 Important Implementation Rules

**Do NOT:**

- Overengineer with Kubernetes initially
- Introduce Kafka/Event Bus architecture yet
- Implement full SOC2/HIPAA systems now
- Implement multi-region infrastructure yet
- Implement advanced metered billing yet

**Focus ONLY on:**

- Production readiness
- Tenant isolation
- Operational stability
- SaaS scalability
- Maintainability
- Realistic deployment

This section should feel like a principal engineer production hardening plan, a SaaS infrastructure upgrade roadmap, and a real-world enterprise backend stabilization strategy — not an over-architected distributed systems pitch.

---

*AgencyOS Multi-Tenant SaaS Migration Blueprint*  
*Generated from DOCUMENTATION.md audit (AgencyOS Backend v1.0.0, May 22, 2026)*  
*Total migration scope: ~15,000 lines of code changes across 60+ files*
*Estimated timeline: 10–12 engineering weeks (1 senior backend + 1 mid-level)*
