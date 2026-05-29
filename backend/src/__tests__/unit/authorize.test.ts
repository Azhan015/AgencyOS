/**
 * Unit Tests — middleware/authorize.ts
 * Tests permission and role-based authorization middleware.
 */
import { authorize, authorizeRoles, hasPermission } from '../../middleware/authorize';
import type { AuthRequest } from '../../middleware/authenticate';
import type { Response, NextFunction } from 'express';

function makeReq(role: string): AuthRequest {
  return {
    user: { id: 'u1', email: 'a@b.com', role, orgRole: role, organizationId: 'org-1', name: 'Test', sessionId: 's1', isPlatformUser: false },
  } as unknown as AuthRequest;
}

const mockRes = {} as Response;

describe('authorize middleware', () => {
  describe('authorize() — permission-based', () => {
    it('calls next() when user has required permission', () => {
      const next = jest.fn() as NextFunction;
      authorize('clients:read')(makeReq('ADMIN'), mockRes, next);
      expect(next).toHaveBeenCalledWith(); // no error arg
    });

    it('calls next(error) when user lacks permission', () => {
      const next = jest.fn() as NextFunction;
      authorize('admin:write')(makeReq('CLIENT'), mockRes, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it('calls next(error) when req.user is missing', () => {
      const next = jest.fn() as NextFunction;
      const req = {} as AuthRequest;
      authorize('clients:read')(req, mockRes, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it('SUPERADMIN has all permissions', () => {
      const next = jest.fn() as NextFunction;
      authorize('admin:write', 'clients:write', 'analytics:write')(makeReq('SUPERADMIN'), mockRes, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('CLIENT cannot write clients', () => {
      const next = jest.fn() as NextFunction;
      authorize('clients:write')(makeReq('CLIENT'), mockRes, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
  });

  describe('authorizeRoles() — role-based', () => {
    it('allows matching role', () => {
      const next = jest.fn() as NextFunction;
      authorizeRoles('ADMIN', 'SUPERADMIN')(makeReq('ADMIN'), mockRes, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('rejects non-matching role', () => {
      const next = jest.fn() as NextFunction;
      authorizeRoles('ADMIN')(makeReq('CLIENT'), mockRes, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
  });

  describe('hasPermission() — helper', () => {
    it('returns true for ADMIN with clients:read', () => {
      expect(hasPermission('ADMIN', 'clients:read')).toBe(true);
    });

    it('returns false for CLIENT with admin:write', () => {
      expect(hasPermission('CLIENT', 'admin:write')).toBe(false);
    });

    it('returns false for unknown role', () => {
      expect(hasPermission('UNKNOWN_ROLE', 'clients:read')).toBe(false);
    });
  });
});
