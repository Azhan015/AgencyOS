import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { authenticatePlatform } from '../../../middleware/authenticate';
import { authorize } from '../../../middleware/authorize';
import { validateBody } from '../../../middleware/validate';
import { PlatformUser } from '../../../models/PlatformUser';
import { NotFoundError, ConflictError } from '../../../lib/errors';

const router = Router();
router.use(authenticatePlatform);

// GET /api/platform/users
router.get('/', authorize('platform-users:read'), async (_req, res, next) => {
  try {
    const users = await PlatformUser.find()
      .select('-passwordHash -mfaSecret')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: users });
  } catch (e) { next(e); }
});

// POST /api/platform/users — PLATFORM_OWNER only
router.post(
  '/',
  authorize('platform-users:write'),
  validateBody(z.object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
    password: z.string().min(12),
    platformRole: z.enum(['PLATFORM_ADMIN', 'PLATFORM_SUPPORT']),
  })),
  async (req, res, next) => {
    try {
      const { email, name, password, platformRole } = req.body;

      const existing = await PlatformUser.findOne({ email: email.toLowerCase() });
      if (existing) throw new ConflictError('Email already registered');

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      const user = await PlatformUser.create({
        email: email.toLowerCase(),
        name,
        passwordHash,
        platformRole,
        createdBy: (req.user as unknown as Express.PlatformUser).id,
      });

      res.status(201).json({ success: true, data: user.toSafeObject() });
    } catch (e) { next(e); }
  }
);

// PATCH /api/platform/users/:id/role
router.patch(
  '/:id/role',
  authorize('platform-users:write'),
  validateBody(z.object({
    platformRole: z.enum(['PLATFORM_ADMIN', 'PLATFORM_SUPPORT']),
  })),
  async (req, res, next) => {
    try {
      const user = await PlatformUser.findByIdAndUpdate(
        req.params.id,
        { platformRole: req.body.platformRole },
        { new: true }
      ).select('-passwordHash');
      if (!user) throw new NotFoundError('Platform user');
      res.json({ success: true, data: user });
    } catch (e) { next(e); }
  }
);

// PATCH /api/platform/users/:id/deactivate
router.patch('/:id/deactivate', authorize('platform-users:write'), async (req, res, next) => {
  try {
    const user = await PlatformUser.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    ).select('-passwordHash');
    if (!user) throw new NotFoundError('Platform user');
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

export default router;
