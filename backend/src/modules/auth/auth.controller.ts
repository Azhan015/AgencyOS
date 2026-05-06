import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as authService from './auth.service';
import { AuthRequest } from '../../middleware/authenticate';
import { env } from '../../config/env';
import { getFrontendUrl } from '../../lib/frontendUrl';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  // Only set domain in production — setting domain in dev can block cookies on some browsers
  ...(env.NODE_ENV === 'production' && env.COOKIE_DOMAIN !== 'localhost'
    ? { domain: env.COOKIE_DOMAIN }
    : {}),
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, name } = req.body;
    const deviceId = (req.headers['x-device-id'] as string) || uuidv4();
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || '0.0.0.0';

    const result = await authService.register({
      email,
      password,
      name,
      deviceInfo: { deviceId, userAgent, ip },
    });

    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res.status(201).json({
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;
    const deviceId = (req.headers['x-device-id'] as string) || uuidv4();
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || '0.0.0.0';

    const result = await authService.login(email, password, { deviceId, userAgent, ip });

    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res.json({
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ success: false, error: { code: 'NO_REFRESH_TOKEN', message: 'Refresh token required' } });
      return;
    }

    const tokens = await authService.refreshTokens(refreshToken);
    res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS);
    res.json({
      success: true,
      data: { accessToken: tokens.accessToken },
    });
  } catch (error) {
    // Clear the stale/invalid refresh token cookie so the browser stops
    // sending it on every request — this prevents an infinite 401 loop
    // when the user's session no longer exists (e.g. after switching DBs).
    res.clearCookie('refreshToken', { ...COOKIE_OPTIONS, maxAge: 0 });
    next(error);
  }
}

export async function logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (req.user) {
      await authService.logout(req.user.sessionId ?? '', refreshToken);
    }
    res.clearCookie('refreshToken', { ...COOKIE_OPTIONS, maxAge: 0 });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

export async function sendMagicLink(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    await authService.sendMagicLink(email, getFrontendUrl(req));
    res.json({ success: true, message: 'If that email exists, a magic link has been sent' });
  } catch (error) {
    next(error);
  }
}

export async function verifyMagicLink(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.body;
    const deviceId = (req.headers['x-device-id'] as string) || uuidv4();
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || '0.0.0.0';

    const result = await authService.verifyMagicLink(token, { deviceId, userAgent, ip });

    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res.json({
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    await authService.sendPasswordReset(email, getFrontendUrl(req));
    res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
}

export async function getDevices(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const devices = await authService.getDevices(req.user!.id);
    res.json({ success: true, data: devices });
  } catch (error) {
    next(error);
  }
}

export async function revokeDevice(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.revokeDevice(req.user!.id, req.params.deviceId);
    res.json({ success: true, message: 'Device revoked' });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { User } = await import('../../models/User');
    const user = await User.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found' } });
      return;
    }
    res.json({ success: true, data: user.toSafeObject() });
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { User } = await import('../../models/User');
    const { name, avatar, notificationPreferences } = req.body;

    const updateFields: Record<string, unknown> = {};
    if (name !== undefined) updateFields.name = name;
    if (avatar !== undefined) updateFields.avatar = avatar;
    if (notificationPreferences !== undefined) updateFields.notificationPreferences = notificationPreferences;

    const user = await User.findByIdAndUpdate(
      req.user!.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found' } });
      return;
    }

    res.json({ success: true, data: user.toSafeObject() });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const argon2 = await import('argon2');
    const { User } = await import('../../models/User');
    const { AuthenticationError } = await import('../../lib/errors');

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user!.id).select('+passwordHash');
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found' } });
      return;
    }

    if (!user.passwordHash) {
      res.status(400).json({ success: false, error: { message: 'No password set. Use magic link to sign in.' } });
      return;
    }

    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) throw new AuthenticationError('Current password is incorrect');

    user.passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
}
