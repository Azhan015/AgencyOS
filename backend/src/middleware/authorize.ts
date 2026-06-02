import { Response, NextFunction } from 'express';
import { AuthRequest } from './authenticate';
import { AuthorizationError } from '../lib/errors';
import type { IOrganization } from '../models/Organization';

// ── Role type definitions ──────────────────────────────────────────────────────

/**
 * Organization-scoped roles (tenant level).
 * These replace the legacy UserRole for all new code.
 */
export type OrgRole =
  | 'ORGANIZATION_OWNER'
  | 'ORGANIZATION_ADMIN'
  | 'PROJECT_MANAGER'
  | 'CONTRIBUTOR'
  | 'CLIENT';

/**
 * Platform-level roles (above all tenants).
 * Used exclusively by PlatformUser model and /api/platform/* routes.
 */
export type PlatformRole =
  | 'PLATFORM_OWNER'
  | 'PLATFORM_ADMIN'
  | 'PLATFORM_SUPPORT';

// ── Permission type ────────────────────────────────────────────────────────────

export type Permission =
  | 'clients:read' | 'clients:write'
  | 'projects:read' | 'projects:write'
  | 'tasks:read' | 'tasks:write'
  | 'files:read' | 'files:write'
  | 'messages:read' | 'messages:write'
  | 'invoices:read' | 'invoices:write'
  | 'contracts:read' | 'contracts:write'
  | 'team:read' | 'team:write'
  | 'analytics:read' | 'analytics:write'
  | 'automations:read' | 'automations:write'
  | 'admin:read' | 'admin:write'
  | 'approvals:read' | 'approvals:write'
  | 'billing:read' | 'billing:write'
  | 'settings:read' | 'settings:write'
  | 'org:delete'
  // Platform permissions
  | 'orgs:read' | 'orgs:write' | 'orgs:delete'
  | 'impersonate' | 'impersonate:readonly'
  | 'feature-flags:read' | 'feature-flags:write'
  | 'platform-users:read' | 'platform-users:write'
  | 'platform:*';

// ── Org-role permission matrix ─────────────────────────────────────────────────

export const ORG_ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
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

// ── Legacy role permission matrix (backward compat during migration) ───────────

const LEGACY_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPERADMIN: [
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
  ],
  ADMIN: [
    'clients:read', 'clients:write',
    'projects:read', 'projects:write',
    'tasks:read', 'tasks:write',
    'files:read', 'files:write',
    'messages:read', 'messages:write',
    'invoices:read', 'invoices:write',
    'contracts:read', 'contracts:write',
    'team:read', 'team:write',
    'analytics:read',
    'automations:read', 'automations:write',
    'admin:read', 'admin:write',
    'approvals:read', 'approvals:write',
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

// ── Platform-role permission matrix ───────────────────────────────────────────

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, Permission[]> = {
  PLATFORM_OWNER: [
    'platform:*',
    'orgs:read', 'orgs:write', 'orgs:delete',
    'billing:read', 'billing:write',
    'impersonate',
    'feature-flags:read', 'feature-flags:write',
    'platform-users:read', 'platform-users:write',
  ],
  PLATFORM_ADMIN: [
    'orgs:read', 'orgs:write',
    'billing:read',
    'impersonate',
    'feature-flags:read',
    'platform-users:read',
  ],
  PLATFORM_SUPPORT: [
    'orgs:read',
    'billing:read',
    'impersonate:readonly',
  ],
};

// ── Guard factories ────────────────────────────────────────────────────────────

/**
 * authorize(...permissions)
 *
 * Works for both org users (checks ORG_ROLE_PERMISSIONS) and
 * platform users (checks PLATFORM_ROLE_PERMISSIONS).
 *
 * PLATFORM_OWNER with 'platform:*' bypasses all permission checks.
 */
export function authorize(...permissions: Permission[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthorizationError('Authentication required'));
    }

    let userPermissions: Permission[];

    if ((req.user as unknown as { isPlatformUser: boolean }).isPlatformUser) {
      const platformUser = req.user as unknown as Express.PlatformUser;
      userPermissions = PLATFORM_ROLE_PERMISSIONS[platformUser.platformRole as PlatformRole] ?? [];
      // PLATFORM_OWNER wildcard bypasses all checks
      if (userPermissions.includes('platform:*')) return next();
    } else {
      // Try new orgRole first, fall back to legacy role
      const orgRole = req.user.orgRole as OrgRole;
      if (orgRole && ORG_ROLE_PERMISSIONS[orgRole]) {
        userPermissions = ORG_ROLE_PERMISSIONS[orgRole];
      } else {
        // Legacy fallback during migration
        userPermissions = LEGACY_ROLE_PERMISSIONS[req.user.role] ?? [];
      }
    }

    const hasAll = permissions.every(p => userPermissions.includes(p));
    if (!hasAll) {
      return next(new AuthorizationError(`Insufficient permissions. Required: ${permissions.join(', ')}`));
    }

    next();
  };
}

/**
 * authorizeRoles(...roles)
 * Checks that the user's orgRole (or legacy role) is in the allowed list.
 * During migration, checks BOTH orgRole and legacy role for backward compat.
 */
export function authorizeRoles(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthorizationError('Authentication required'));
    }

    const isPlatform = (req.user as unknown as { isPlatformUser: boolean }).isPlatformUser;
    if (isPlatform) {
      const platformUser = req.user as unknown as Express.PlatformUser;
      if (!roles.includes(platformUser.platformRole)) {
        return next(new AuthorizationError(`Role '${platformUser.platformRole}' is not authorized for this action`));
      }
      return next();
    }

    // Check orgRole first, then fall back to legacy role
    // This ensures both old code (ADMIN/SUPERADMIN) and new code (ORGANIZATION_ADMIN) work
    const orgRole = req.user.orgRole;
    const legacyRole = req.user.role;

    if (roles.includes(orgRole) || roles.includes(legacyRole)) {
      return next();
    }

    return next(new AuthorizationError(`Role '${orgRole || legacyRole}' is not authorized for this action`));
  };
}

/**
 * requireFeature(featureKey)
 * Checks that the org has a specific feature flag enabled.
 * Must run AFTER tenantScope() (requires req.organization).
 */
export function requireFeature(featureKey: keyof IOrganization['features']) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    const org = req.organization;
    if (!org) {
      return next(new AuthorizationError('No organization context — run tenantScope() first'));
    }
    if (!org.features[featureKey]) {
      return next(new AuthorizationError(`Feature '${featureKey}' is not enabled for your plan`));
    }
    next();
  };
}

/**
 * hasPermission(role, permission) — utility for service-layer checks
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const orgPerms = ORG_ROLE_PERMISSIONS[role as OrgRole];
  if (orgPerms) return orgPerms.includes(permission);
  return (LEGACY_ROLE_PERMISSIONS[role] ?? []).includes(permission);
}
