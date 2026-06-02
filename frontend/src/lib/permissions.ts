/**
 * Client-side permission helper — mirrors the backend ROLE_PERMISSIONS map.
 * Used to conditionally show/hide UI elements based on the logged-in user's role.
 * The backend always enforces permissions authoritatively; this is purely for UX.
 */

type Permission =
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
  | 'approvals:read' | 'approvals:write';

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // ── Legacy roles (backward compat) ────────────────────────────────────────
  SUPERADMIN: [
    'clients:read', 'clients:write', 'projects:read', 'projects:write',
    'tasks:read', 'tasks:write', 'files:read', 'files:write',
    'messages:read', 'messages:write', 'invoices:read', 'invoices:write',
    'contracts:read', 'contracts:write', 'team:read', 'team:write',
    'analytics:read', 'analytics:write', 'automations:read', 'automations:write',
    'admin:read', 'admin:write', 'approvals:read', 'approvals:write',
  ],
  ADMIN: [
    'clients:read', 'clients:write', 'projects:read', 'projects:write',
    'tasks:read', 'tasks:write', 'files:read', 'files:write',
    'messages:read', 'messages:write', 'invoices:read', 'invoices:write',
    'contracts:read', 'contracts:write', 'team:read', 'team:write',
    'analytics:read', 'automations:read', 'automations:write',
    'admin:read', 'admin:write', 'approvals:read', 'approvals:write',
  ],
  PROJECT_MANAGER: [
    'clients:read', 'projects:read', 'projects:write',
    'tasks:read', 'tasks:write', 'files:read', 'files:write',
    'messages:read', 'messages:write', 'invoices:read', 'contracts:read',
    'analytics:read', 'approvals:read', 'approvals:write',
  ],
  CONTRIBUTOR: [
    'projects:read', 'tasks:read', 'tasks:write',
    'files:read', 'files:write', 'messages:read', 'messages:write', 'approvals:read',
  ],
  CLIENT: [
    'projects:read', 'tasks:read', 'files:read',
    'messages:read', 'messages:write', 'invoices:read',
    'contracts:read', 'approvals:read', 'approvals:write',
  ],
  // ── New orgRoles (multi-tenant) ────────────────────────────────────────────
  ORGANIZATION_OWNER: [
    'clients:read', 'clients:write', 'projects:read', 'projects:write',
    'tasks:read', 'tasks:write', 'files:read', 'files:write',
    'messages:read', 'messages:write', 'invoices:read', 'invoices:write',
    'contracts:read', 'contracts:write', 'team:read', 'team:write',
    'analytics:read', 'analytics:write', 'automations:read', 'automations:write',
    'admin:read', 'admin:write', 'approvals:read', 'approvals:write',
  ],
  ORGANIZATION_ADMIN: [
    'clients:read', 'clients:write', 'projects:read', 'projects:write',
    'tasks:read', 'tasks:write', 'files:read', 'files:write',
    'messages:read', 'messages:write', 'invoices:read', 'invoices:write',
    'contracts:read', 'contracts:write', 'team:read', 'team:write',
    'analytics:read', 'automations:read', 'automations:write',
    'admin:read', 'admin:write', 'approvals:read', 'approvals:write',
  ],
};

export function hasPermission(role: string, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

export function hasAnyPermission(role: string, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

/**
 * Check permission using both orgRole (new) and legacy role.
 * Use this when you have access to the full AuthUser object.
 */
export function userHasPermission(
  user: { role: string; orgRole?: string },
  permission: Permission
): boolean {
  return hasPermission(user.orgRole ?? user.role, permission) ||
    hasPermission(user.role, permission);
}
