import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorizeRoles } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { User } from '../../models/User';
import { AuditLog } from '../../models/AuditLog';
import { NotFoundError, AuthorizationError } from '../../lib/errors';
import argon2 from 'argon2';

const router = Router();
router.use(authenticate, authorizeRoles('ADMIN', 'SUPERADMIN'));

// Team management
router.get('/team', async (_req, res, next) => {
  try {
    const team = await User.find({ role: { $in: ['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR', 'SUPERADMIN'] } })
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: team });
  } catch (e) { next(e); }
});

router.post('/team/invite', validateBody(z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR', 'CLIENT']),
})), async (req: AuthRequest, res, next) => {
  try {
    const { email, name, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ success: false, error: { message: 'Email already exists' } });
      return;
    }

    const tempPassword = Math.random().toString(36).slice(-12);
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });

    const user = await User.create({ email, name, role, passwordHash });

    // Send invite email using proper template
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
    const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true }).select('-passwordHash');
    if (!user) throw new NotFoundError('User');
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

router.patch('/team/:id/deactivate', async (req: AuthRequest, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true }).select('-passwordHash');
    if (!user) throw new NotFoundError('User');
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

router.patch('/team/:id/activate', async (req: AuthRequest, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true }).select('-passwordHash');
    if (!user) throw new NotFoundError('User');
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

// Audit logs
router.get('/audit-logs', async (req: AuthRequest, res, next) => {
  try {
    const { page = '1', limit = '50', userId, resource } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
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

// ── Promote user to SUPERADMIN (SUPERADMIN only) ──────────────────────────────
// Use this endpoint to promote your own account or any account to SUPERADMIN.
// Only existing SUPERADMINs can call this. On a fresh install, use the
// /admin/bootstrap-superadmin endpoint (no auth required, only works when
// there are zero SUPERADMINs in the database).
router.patch('/team/:id/promote-superadmin', async (req: AuthRequest, res, next) => {
  try {
    // Only SUPERADMIN can promote to SUPERADMIN
    if (req.user?.role !== 'SUPERADMIN') {
      throw new AuthorizationError('Only a SUPERADMIN can promote another user to SUPERADMIN');
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: 'SUPERADMIN' },
      { new: true }
    ).select('-passwordHash');
    if (!user) throw new NotFoundError('User');
    res.json({ success: true, data: user, message: `${user.name} has been promoted to SUPERADMIN` });
  } catch (e) { next(e); }
});

// ── MongoDB health check ──────────────────────────────────────────────────────
// Returns connection state, database name, and registered users count.
router.get('/db-health', async (_req, res, next) => {
  try {
    const state = mongoose.connection.readyState;
    const stateMap: Record<number, string> = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    const dbName = mongoose.connection.db?.databaseName ?? 'unknown';
    const userCount = await User.countDocuments();
    const users = await User.find().select('name email role isActive createdAt').sort({ createdAt: -1 }).limit(20).lean();
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
