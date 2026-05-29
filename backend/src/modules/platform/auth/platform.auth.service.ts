import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { PlatformUser, IPlatformUser } from '../../../models/PlatformUser';
import {
  signPlatformAccessToken,
  signPlatformRefreshToken,
  verifyPlatformRefreshToken,
} from '../../../lib/jwt';
import { hashSHA256, generateSecureToken } from '../../../lib/crypto';
import { cacheGet, cacheSet, cacheDel } from '../../../config/redis';
import { AuthenticationError, ConflictError, NotFoundError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';

const PLATFORM_REFRESH_PREFIX = 'platform:refresh:';
const MAX_DEVICES = 5;

export interface PlatformTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface PlatformLoginResult extends PlatformTokenPair {
  user: Partial<IPlatformUser>;
}

export async function platformLogin(
  email: string,
  password: string,
  deviceInfo: { deviceId: string; userAgent: string; ip: string }
): Promise<PlatformLoginResult> {
  const user = await PlatformUser.findOne({ email: email.toLowerCase().trim() })
    .select('+passwordHash');

  if (!user || !user.isActive) {
    throw new AuthenticationError('Invalid credentials');
  }

  if (!user.passwordHash) {
    throw new AuthenticationError('No password set for this account');
  }

  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) {
    // Log failed attempt
    await PlatformUser.findByIdAndUpdate(user._id, {
      $push: {
        loginHistory: {
          ip: deviceInfo.ip,
          userAgent: deviceInfo.userAgent,
          at: new Date(),
          success: false,
        },
      },
    });
    throw new AuthenticationError('Invalid credentials');
  }

  // Update device list
  await updateDeviceList(user, deviceInfo);

  // Log successful login
  user.lastLoginAt = new Date();
  await user.save();

  await PlatformUser.findByIdAndUpdate(user._id, {
    $push: {
      loginHistory: {
        ip: deviceInfo.ip,
        userAgent: deviceInfo.userAgent,
        at: new Date(),
        success: true,
      },
    },
  });

  const sessionId = uuidv4();
  const tokens = await generatePlatformTokenPair(user, sessionId);

  return { ...tokens, user: user.toSafeObject() };
}

export async function platformRefreshTokens(refreshToken: string): Promise<PlatformTokenPair> {
  const payload = verifyPlatformRefreshToken(refreshToken);

  // Check family revocation
  const familyRevoked = await cacheGet<string>(`platform:revoked:family:${payload.family}`);
  if (familyRevoked) {
    throw new AuthenticationError('Session revoked. Please sign in again.');
  }

  // Verify stored hash
  const storedKey = `${PLATFORM_REFRESH_PREFIX}${payload.sessionId}`;
  const storedHash = await cacheGet<string>(storedKey);

  if (storedHash !== null) {
    const tokenHash = hashSHA256(refreshToken);
    if (storedHash !== tokenHash) {
      // Token reuse — revoke family
      await cacheSet(`platform:revoked:family:${payload.family}`, '1', 7 * 24 * 60 * 60);
      throw new AuthenticationError('Token reuse detected. All platform sessions revoked.');
    }
    await cacheDel(storedKey);
  }

  const user = await PlatformUser.findById(payload.sub);
  if (!user || !user.isActive) throw new AuthenticationError('Platform user not found');

  const newSessionId = uuidv4();
  return generatePlatformTokenPair(user, newSessionId, payload.family);
}

export async function platformLogout(sessionId: string): Promise<void> {
  await cacheDel(`${PLATFORM_REFRESH_PREFIX}${sessionId}`);
  // Revoke access token for its remaining lifetime (15 min)
  await cacheSet(`platform:revoked:session:${sessionId}`, '1', 15 * 60);
  // Invalidate platform user cache
  logger.info({ sessionId }, 'Platform user logged out');
}

// ── Internal helpers ───────────────────────────────────────────────────────────

async function generatePlatformTokenPair(
  user: IPlatformUser,
  sessionId: string,
  family?: string
): Promise<PlatformTokenPair> {
  const tokenFamily = family || uuidv4();

  const accessToken = signPlatformAccessToken({
    sub: user._id.toString(),
    platformRole: user.platformRole,
    sessionId,
  });

  const refreshToken = signPlatformRefreshToken({
    sub: user._id.toString(),
    sessionId,
    family: tokenFamily,
  });

  const hash = hashSHA256(refreshToken);
  await cacheSet(`${PLATFORM_REFRESH_PREFIX}${sessionId}`, hash, 7 * 24 * 60 * 60);

  return { accessToken, refreshToken };
}

async function updateDeviceList(
  user: IPlatformUser,
  deviceInfo: { deviceId: string; userAgent: string; ip: string }
): Promise<void> {
  const existingIndex = user.devices.findIndex(d => d.deviceId === deviceInfo.deviceId);

  if (existingIndex >= 0) {
    user.devices[existingIndex].lastSeenAt = new Date();
    user.devices[existingIndex].userAgent = deviceInfo.userAgent;
  } else {
    if (user.devices.length >= MAX_DEVICES) {
      user.devices.sort((a, b) => a.lastSeenAt.getTime() - b.lastSeenAt.getTime());
      user.devices.shift();
    }
    user.devices.push({
      deviceId: deviceInfo.deviceId,
      userAgent: deviceInfo.userAgent,
      lastSeenAt: new Date(),
      ipAddress: deviceInfo.ip,
    });
  }
}
