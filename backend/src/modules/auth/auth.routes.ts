import { Router } from 'express';
import { z } from 'zod';
import * as controller from './auth.controller';
import { authenticate } from '../../middleware/authenticate';
import { validateBody } from '../../middleware/validate';
import { authLimiter, strictLimiter } from '../../middleware/rateLimiter';

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

export default router;
