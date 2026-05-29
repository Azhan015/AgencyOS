/**
 * Global Express type augmentation — Multi-Tenant Edition
 *
 * Two distinct user shapes exist in this system:
 *
 * 1. OrgUser  — a user belonging to a specific organization (tenant)
 *    Set by: authenticate() middleware
 *    Has: organizationId, orgRole, isPlatformUser = false
 *
 * 2. PlatformUser — a platform-level admin (above all tenants)
 *    Set by: authenticatePlatform() middleware
 *    Has: platformRole, isPlatformUser = true
 *    May have: impersonating (when acting as an org admin)
 *
 * req.organization — set by tenantScope() middleware (after authenticate)
 * req.tenantFilter — { organizationId } shorthand for all DB queries
 * req.requestId    — set by requestId() middleware
 */

import type { IOrganization } from '../models/Organization';

declare global {
  namespace Express {
    // ── Org-scoped user (standard authenticated user) ──────────────────────
    interface User {
      id: string;
      email: string;
      /** Organization-scoped role */
      orgRole: import('../middleware/authorize').OrgRole;
      /** Legacy role — kept for backward compatibility during migration */
      role: string;
      /** The tenant this user belongs to */
      organizationId: string;
      clientId?: string;
      sessionId: string;
      name: string;
      /** Always false for org users */
      isPlatformUser: false;
    }

    // ── Platform-level admin user ──────────────────────────────────────────
    interface PlatformUser {
      id: string;
      email: string;
      platformRole: import('../middleware/authorize').PlatformRole;
      sessionId: string;
      name: string;
      /** Always true for platform users */
      isPlatformUser: true;
      /** Present when this platform user is impersonating an org admin */
      impersonating?: {
        organizationId: string;
        originalPlatformUserId: string;
        grantedAt: Date;
      };
    }

    interface Request {
      /** Set by authenticate() or authenticatePlatform() */
      user?: User | PlatformUser;
      /** Set by tenantScope() — the validated organization for this request */
      organization?: IOrganization;
      /** Shorthand filter for all DB queries — always prepend this */
      tenantFilter?: { organizationId: string };
      /** Set by requestId() middleware */
      requestId?: string;
    }
  }
}

export {};
