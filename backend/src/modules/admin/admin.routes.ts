import { Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorizeRoles } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { User } from '../../models/User';
import { AuditLog } from '../../models/AuditLog';
import { NotFoundError } from '../../lib/errors';
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
  role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR']),
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

    // Send invite email
    const { sendEmail } = await import('../../lib/email');
    const { env } = await import('../../config/env');
    await sendEmail({
      to: email,
      subject: `You've been invited to ${env.AGENCY_NAME}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2>Welcome to ${env.AGENCY_NAME}</h2>
          <p>Hi ${name}, you've been invited as a ${role}.</p>
          <p>Your temporary password: <strong>${tempPassword}</strong></p>
          <p>Please log in and change your password immediately.</p>
          <a href="${env.FRONTEND_URL}/auth/login" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Login</a>
        </div>
      `,
    });

    res.status(201).json({ success: true, data: user.toSafeObject() });
  } catch (e) { next(e); }
});

router.patch('/team/:id/role', validateBody(z.object({
  role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR']),
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

export default router;
