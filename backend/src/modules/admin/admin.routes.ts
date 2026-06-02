import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorize, authorizeRoles } from '../../middleware/authorize';
import { tenantScope } from '../../middleware/tenantScope';
import { validateBody } from '../../middleware/validate';
import { User } from '../../models/User';
import { AuditLog } from '../../models/AuditLog';
import { NotFoundError, AuthorizationError } from '../../lib/errors';
import argon2 from 'argon2';

const router = Router();

// All admin routes require authentication + org scope + admin-level role
// authorizeRoles checks both new orgRole AND legacy role for backward compat
router.use(
  authenticate,
  tenantScope,
  authorizeRoles(
    // New org roles
    'ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN',
    // Legacy roles (backward compat during migration)
    'ADMIN', 'SUPERADMIN'
  )
);

// ── Team management ────────────────────────────────────────────────────────────

router.get('/team', async (req: AuthRequest, _res, next) => {
  try {
    // Org-scoped: only return team members in this organization
    const orgFilter = req.tenantFilter ?? {};
    const team = await User.find({
      ...orgFilter,
      role: { $in: ['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR', 'SUPERADMIN', 'ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN'] },
    })
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .lean();
    _res.json({ success: true, data: team });
  } catch (e) { next(e); }
});

router.post('/team/invite', validateBody(z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR', 'CLIENT']),
})), async (req: AuthRequest, res, next) => {
  try {
    const { email, name, role } = req.body;

    // Check for existing user in this org
    const existing = await User.findOne({
      email,
      ...(req.tenantFilter ?? {}),
    });
    if (existing) {
      res.status(409).json({ success: false, error: { message: 'Email already exists' } });
      return;
    }

    const tempPassword = Math.random().toString(36).slice(-12);
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });

    // Map legacy role to orgRole
    const orgRoleMap: Record<string, string> = {
      ADMIN: 'ORGANIZATION_ADMIN',
      PROJECT_MANAGER: 'PROJECT_MANAGER',
      CONTRIBUTOR: 'CONTRIBUTOR',
    };

    const user = await User.create({
      email,
      name,
      role,
      orgRole: orgRoleMap[role] || 'CONTRIBUTOR',
      organizationId: req.user?.organizationId,
      passwordHash,
    });

    const { sendEmail, getTeamInviteEmail } = await import('../../lib/email');
    const { env } = await import('../../config/env');
    const { getFrontendUrl } = await import('../../lib/frontendUrl');
    const frontendUrl = getFrontendUrl(req);
    await sendEmail({
      to: email,
      subject: `You've been invited to ${env.AGENCY_NAME}`,
      html: getTeamInviteEmail(name, email, role, env.AGENCY_NAME, `${frontendUrl}/auth/login`, tempPassword),
    });

    res.status(201).json({ success: true, data: user.toSafeObject() });
  } catch (e) { next(e); }
});

router.patch('/team/:id/role', validateBody(z.object({
  role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR', 'CLIENT']),
})), async (req: AuthRequest, res, next) => {
  try {
    const orgRoleMap: Record<string, string> = {
      ADMIN: 'ORGANIZATION_ADMIN',
      PROJECT_MANAGER: 'PROJECT_MANAGER',
      CONTRIBUTOR: 'CONTRIBUTOR',
    };
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...(req.tenantFilter ?? {}) },
      { role: req.body.role, orgRole: orgRoleMap[req.body.role] || req.body.role },
      { new: true }
    ).select('-passwordHash');
    if (!user) throw new NotFoundError('User');
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

router.patch('/team/:id/deactivate', async (req: AuthRequest, res, next) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...(req.tenantFilter ?? {}) },
      { isActive: false },
      { new: true }
    ).select('-passwordHash');
    if (!user) throw new NotFoundError('User');
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

router.patch('/team/:id/activate', async (req: AuthRequest, res, next) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...(req.tenantFilter ?? {}) },
      { isActive: true },
      { new: true }
    ).select('-passwordHash');
    if (!user) throw new NotFoundError('User');
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

// ── Promote to ORGANIZATION_OWNER (ORGANIZATION_OWNER only) ───────────────────
router.patch('/team/:id/promote-owner', async (req: AuthRequest, res, next) => {
  try {
    const userRole = req.user?.orgRole || req.user?.role;
    if (userRole !== 'ORGANIZATION_OWNER' && userRole !== 'SUPERADMIN') {
      throw new AuthorizationError('Only an ORGANIZATION_OWNER can promote another user to owner');
    }
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...(req.tenantFilter ?? {}) },
      { role: 'ADMIN', orgRole: 'ORGANIZATION_OWNER' },
      { new: true }
    ).select('-passwordHash');
    if (!user) throw new NotFoundError('User');
    res.json({ success: true, data: user, message: `${user.name} promoted to ORGANIZATION_OWNER` });
  } catch (e) { next(e); }
});

// ── Legacy promote-superadmin (backward compat — dev only) ────────────────────
router.patch('/team/:id/promote-superadmin', async (req: AuthRequest, res, next) => {
  try {
    if (req.user?.role !== 'SUPERADMIN' && req.user?.orgRole !== 'ORGANIZATION_OWNER') {
      throw new AuthorizationError('Only a SUPERADMIN or ORGANIZATION_OWNER can promote to SUPERADMIN');
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: 'SUPERADMIN', orgRole: 'ORGANIZATION_OWNER' },
      { new: true }
    ).select('-passwordHash');
    if (!user) throw new NotFoundError('User');
    res.json({ success: true, data: user, message: `${user.name} promoted to SUPERADMIN` });
  } catch (e) { next(e); }
});

// ── Audit logs ─────────────────────────────────────────────────────────────────

router.get('/audit-logs', async (req: AuthRequest, res, next) => {
  try {
    const { page = '1', limit = '50', userId, resource } = req.query as Record<string, string>;

    // Org-scoped audit logs
    const filter: Record<string, unknown> = { ...(req.tenantFilter ?? {}) };
    if (userId) filter.userId = userId;
    if (resource) filter.resource = resource;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ success: true, data: { logs, total, page: Number(page), limit: Number(limit) } });
  } catch (e) { next(e); }
});

// ── DB health check ────────────────────────────────────────────────────────────

router.get('/db-health', async (req: AuthRequest, res, next) => {
  try {
    const state = mongoose.connection.readyState;
    const stateMap: Record<number, string> = {
      0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting',
    };
    const dbName = mongoose.connection.db?.databaseName ?? 'unknown';

    // Org-scoped user count
    const orgFilter = req.tenantFilter ?? {};
    const userCount = await User.countDocuments(orgFilter);
    const users = await User.find(orgFilter)
      .select('name email role orgRole isActive createdAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      success: true,
      data: {
        status: stateMap[state] ?? 'unknown',
        readyState: state,
        database: dbName,
        totalUsers: userCount,
        recentUsers: users,
      },
    });
  } catch (e) { next(e); }
});

export default router;
