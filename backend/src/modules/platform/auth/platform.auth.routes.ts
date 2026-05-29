import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { validateBody } from '../../../middleware/validate';
import { authenticatePlatform } from '../../../middleware/authenticate';
import { authLimiter } from '../../../middleware/rateLimiter';
import * as service from './platform.auth.service';
import { env } from '../../../config/env';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  ...(env.NODE_ENV === 'production' && env.COOKIE_DOMAIN !== 'localhost'
    ? { domain: env.COOKIE_DOMAIN }
    : {}),
};

// POST /api/platform/auth/login
router.post(
  '/login',
  authLimiter,
  validateBody(z.object({
    email: z.string().email(),
    password: z.string().min(1),
  })),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const deviceId = (req.headers['x-device-id'] as string) || uuidv4();
      const userAgent = req.headers['user-agent'] || 'unknown';
      const ip = req.ip || '0.0.0.0';

      const result = await service.platformLogin(email, password, { deviceId, userAgent, ip });

      res.cookie('platformRefreshToken', result.refreshToken, COOKIE_OPTIONS);
      res.json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (e) { next(e); }
  }
);

// POST /api/platform/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.platformRefreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ success: false, error: { message: 'Refresh token required' } });
      return;
    }
    const tokens = await service.platformRefreshTokens(refreshToken);
    res.cookie('platformRefreshToken', tokens.refreshToken, COOKIE_OPTIONS);
    res.json({ success: true, data: { accessToken: tokens.accessToken } });
  } catch (e) {
    res.clearCookie('platformRefreshToken', { ...COOKIE_OPTIONS, maxAge: 0 });
    next(e);
  }
});

// POST /api/platform/auth/logout
router.post('/logout', authenticatePlatform, async (req, res, next) => {
  try {
    const user = req.user as unknown as Express.PlatformUser;
    await service.platformLogout(user.sessionId);
    res.clearCookie('platformRefreshToken', { ...COOKIE_OPTIONS, maxAge: 0 });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (e) { next(e); }
});

// GET /api/platform/auth/me
router.get('/me', authenticatePlatform, async (req, res, next) => {
  try {
    const { PlatformUser } = await import('../../../models/PlatformUser');
    const user = req.user as unknown as Express.PlatformUser;
    const platformUser = await PlatformUser.findById(user.id);
    if (!platformUser) {
      res.status(404).json({ success: false, error: { message: 'Platform user not found' } });
      return;
    }
    res.json({ success: true, data: platformUser.toSafeObject() });
  } catch (e) { next(e); }
});

export default router;
