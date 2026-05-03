import { Response, NextFunction } from 'express';
import { AuthRequest } from './authenticate';
import { AuthorizationError } from '../lib/errors';

export type Permission =
  | 'clients:read' | 'clients:write'
  | 'projects:read' | 'projects:write'
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
  SUPERADMIN: [
    'clients:read', 'clients:write',
    'projects:read', 'projects:write',
    'files:read', 'files:write',
    'messages:read', 'messages:write',
    'invoices:read', 'invoices:write',
    'contracts:read', 'contracts:write',
    'team:read', 'team:write',
    'analytics:read', 'analytics:write',
    'automations:read', 'automations:write',
    'admin:read', 'admin:write',
    'approvals:read', 'approvals:write',
  ],
  ADMIN: [
    'clients:read', 'clients:write',
    'projects:read', 'projects:write',
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
    'files:read', 'files:write',
    'messages:read', 'messages:write',
    'invoices:read',
    'contracts:read',
    'analytics:read',
    'approvals:read', 'approvals:write',
  ],
  CONTRIBUTOR: [
    'projects:read',
    'files:read', 'files:write',
    'messages:read', 'messages:write',
    'approvals:read',
  ],
  CLIENT: [
    'projects:read',
    'files:read',
    'messages:read', 'messages:write',
    'invoices:read',
    'contracts:read',
    'approvals:read', 'approvals:write',
  ],
};

export function authorize(...permissions: Permission[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthorizationError('Authentication required'));
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
    const hasPermission = permissions.every(p => userPermissions.includes(p));

    if (!hasPermission) {
      return next(new AuthorizationError(`Insufficient permissions. Required: ${permissions.join(', ')}`));
    }

    next();
  };
}

export function authorizeRoles(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthorizationError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AuthorizationError(`Role ${req.user.role} is not authorized`));
    }

    next();
  };
}

export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission);
}
