import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import passport from 'passport';
import * as controller from './auth.controller';
import { authenticate } from '../../middleware/authenticate';
import { validateBody } from '../../middleware/validate';
import { authLimiter, strictLimiter } from '../../middleware/rateLimiter';
import { signAccessToken, signRefreshToken } from '../../lib/jwt';
import { hashSHA256 } from '../../lib/crypto';
import { cacheSet } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import type { IUser } from '../../models/User';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const magicLinkSchema = z.object({
  email: z.string().email(),
});

const verifyMagicSchema = z.object({
  token: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

router.post('/register', authLimiter, validateBody(registerSchema), controller.register);
router.post('/login', authLimiter, validateBody(loginSchema), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', authenticate, controller.logout);
router.post('/magic-link', strictLimiter, validateBody(magicLinkSchema), controller.sendMagicLink);
router.post('/magic-link/verify', authLimiter, validateBody(verifyMagicSchema), controller.verifyMagicLink);
router.post('/forgot-password', strictLimiter, validateBody(forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), controller.resetPassword);
router.get('/me', authenticate, controller.getMe);
router.patch('/me', authenticate, validateBody(z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional(),
  notificationPreferences: z.record(z.boolean()).optional(),
})), controller.updateMe);
router.patch('/me/password', authenticate, validateBody(z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
})), controller.changePassword);
router.get('/devices', authenticate, controller.getDevices);
router.delete('/devices/:deviceId', authenticate, controller.revokeDevice);

// ── Dev-only: set password directly without email/Redis ──────────────────────
// Lets you recover from a locked-out account in development.
// Automatically disabled in production (NODE_ENV !== 'development' → 403).
// Usage: POST /api/v1/auth/dev-set-password  { email, password }
router.post('/dev-set-password', async (req, res, next) => {
  try {
    if (env.NODE_ENV !== 'development') {
      res.status(403).json({ success: false, error: { message: 'Only available in development' } });
      return;
    }
    const { email, password } = req.body;
    if (!email || !password || password.length < 8) {
      res.status(400).json({ success: false, error: { message: 'email and password (min 8 chars) required' } });
      return;
    }
    const { User } = await import('../../models/User');
    const argon2 = await import('argon2');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { passwordHash },
      { new: true }
    ).select('-passwordHash');
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'No user found with that email. Register first.' } });
      return;
    }
    res.json({ success: true, message: `Password set for ${user.email}. You can now sign in.` });
  } catch (e) { next(e); }
});

// ── Google OAuth ──────────────────────────────────────────────────────────────
// Step 1: Redirect user to Google's consent screen.
// We encode the frontend origin in the OAuth `state` parameter so the callback
// can redirect back to the correct port (5173 for local dev, 3000 for Docker,
// or the production URL). This is far more reliable than reading the Referer
// header, which Google does not forward.
router.get(
  '/google',
  authLimiter,
  (req, res, next) => {
    // Read the frontend origin from the query string (set by the frontend button)
    // and embed it in the OAuth state so we can recover it in the callback.
    const origin = (req.query.origin as string) || env.FRONTEND_URL;
    // Whitelist: only allow known origins to prevent open-redirect attacks
    const allowed = [env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'];
    const safeOrigin = allowed.includes(origin) ? origin : env.FRONTEND_URL;
    // Base64-encode so it survives URL encoding in the state param
    const state = Buffer.from(JSON.stringify({ origin: safeOrigin })).toString('base64url');
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
      state,
    })(req, res, next);
  }
);

// Step 2: Google redirects back here after user consents
router.get(
  '/google/callback',
  (req, res, next) => {
    // Decode the frontend origin from state before Passport processes the callback
    // so we can use it in the success handler below.
    // We store it on res.locals (typed as Record<string,unknown>) to avoid
    // casting req which TypeScript rejects.
    try {
      const stateRaw = req.query.state as string | undefined;
      if (stateRaw) {
        const decoded = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8'));
        res.locals._frontendOrigin = decoded.origin || env.FRONTEND_URL;
      }
    } catch {
      res.locals._frontendOrigin = env.FRONTEND_URL;
    }
    next();
  },
  (req, res, next) => {
    const frontendOrigin = (res.locals._frontendOrigin as string) || env.FRONTEND_URL;
    passport.authenticate('google', {
      session: false,
      failureRedirect: `${frontendOrigin}/auth/login?error=google_failed`,
    })(req, res, next);
  },
  async (req, res) => {
    try {
      const user = req.user as unknown as IUser;
      const frontendOrigin = (res.locals._frontendOrigin as string) || env.FRONTEND_URL;

      if (!user) {
        res.redirect(`${frontendOrigin}/auth/login?error=google_failed`);
        return;
      }

      const sessionId = uuidv4();
      const tokenFamily = uuidv4();

      const accessToken = signAccessToken({
        sub: user._id.toString(),
        role: user.role,
        orgRole: user.orgRole || user.role,
        organizationId: user.organizationId?.toString() || '',
        clientId: user.clientId?.toString(),
        sessionId,
      });

      const refreshToken = signRefreshToken({
        sub: user._id.toString(),
        sessionId,
        family: tokenFamily,
        organizationId: user.organizationId?.toString() || '',
      });

      // Store refresh token hash in Redis
      const hash = hashSHA256(refreshToken);
      await cacheSet(`refresh:${sessionId}`, hash, 7 * 24 * 60 * 60);

      // Set refresh token as httpOnly cookie
      const cookieOptions = {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        ...(env.NODE_ENV === 'production' && env.COOKIE_DOMAIN !== 'localhost'
          ? { domain: env.COOKIE_DOMAIN }
          : {}),
      };
      res.cookie('refreshToken', refreshToken, cookieOptions);

      res.redirect(`${frontendOrigin}/auth/google/callback#token=${accessToken}`);
    } catch (error) {
      logger.error({ error }, 'Google OAuth callback error');
      const frontendOrigin = (res.locals._frontendOrigin as string) || env.FRONTEND_URL;
      res.redirect(`${frontendOrigin}/auth/login?error=google_failed`);
    }
  }
);

export default router;
