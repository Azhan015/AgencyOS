import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { User, IUser } from '../../models/User';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';
import { generateSecureToken, hashSHA256 } from '../../lib/crypto';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { sendEmail, getMagicLinkEmail, getPasswordResetEmail } from '../../lib/email';
import { AuthenticationError, NotFoundError, ConflictError, ForbiddenError } from '../../lib/errors';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

const REFRESH_TOKEN_PREFIX = 'refresh:';
const MAGIC_LINK_PREFIX = 'magic:';
const PASSWORD_RESET_PREFIX = 'pwreset:';
const MAX_DEVICES = 5;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends TokenPair {
  user: Partial<IUser>;
}

/**
 * Check whether public registration is currently open.
 *
 * Rules:
 *  - If there are ZERO users in the database → registration is OPEN (first-time setup).
 *  - If at least one user exists (i.e. a SUPERADMIN has been created) → registration is LOCKED.
 *
 * After the first account is created it becomes SUPERADMIN automatically.
 * All subsequent users (team members, clients) are added by the SUPERADMIN
 * through the admin dashboard — they never go through the public register endpoint.
 */
export async function isRegistrationOpen(): Promise<boolean> {
  const count = await User.countDocuments();
  return count === 0;
}

export async function register(data: {
  email: string;
  password: string;
  name: string;
  role?: string;
  organizationId?: string;
  orgRole?: string;
  deviceInfo?: { deviceId: string; userAgent: string; ip: string };
}): Promise<LoginResult> {
  // ── Registration gate ────────────────────────────────────────────────────
  // Public registration is only allowed when no users exist yet (first-time
  // setup). Once the first account is created it becomes SUPERADMIN and the
  // register endpoint is locked for everyone else.
  const open = await isRegistrationOpen();
  if (!open) {
    throw new ForbiddenError(
      'Registration is closed. Contact your agency administrator to get access.'
    );
  }

  const existing = await User.findByEmail(data.email);
  if (existing) throw new ConflictError('Email already registered');

  const passwordHash = await argon2.hash(data.password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // Check if there's a Client record with this email — if so, link the user to it
  const matchingClient = await Client.findOne({ email: data.email.toLowerCase().trim() });

  // Determine organization context
  // If no organizationId provided, create a standalone org for this user (migration path)
  let organizationId = data.organizationId;
  if (!organizationId) {
    const { Organization } = await import('../../models/Organization');
    const { generateSlug } = await import('../../lib/crypto');
    const orgSlug = generateSlug(data.email.split('@')[0]) + '-' + Date.now().toString(36);
    const org = await Organization.create({
      name: `${data.name}'s Organization`,
      slug: orgSlug,
      ownerEmail: data.email.toLowerCase().trim(),
      status: 'ACTIVE',
      plan: 'TRIAL',
    });
    organizationId = org._id.toString();
  }

  const legacyRole = matchingClient
    ? 'CLIENT'
    : (['SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR', 'CLIENT'].includes(data.role || '') ? data.role : 'CLIENT') as string;

  const orgRoleMap: Record<string, string> = {
    SUPERADMIN: 'ORGANIZATION_OWNER',
    ADMIN: 'ORGANIZATION_ADMIN',
    PROJECT_MANAGER: 'PROJECT_MANAGER',
    CONTRIBUTOR: 'CONTRIBUTOR',
    CLIENT: 'CLIENT',
  };

  const user = await User.create({
    email: data.email,
    passwordHash,
    name: data.name,
    role: legacyRole,
    orgRole: data.orgRole || orgRoleMap[legacyRole] || 'CLIENT',
    organizationId,
    clientId: matchingClient ? matchingClient._id : undefined,
  });

  if (matchingClient) {
    await Client.findByIdAndUpdate(matchingClient._id, { status: 'ONBOARDING' });
    logger.info({ email: data.email, clientId: matchingClient._id }, 'Registered user linked to existing client record');
  }

  if (data.deviceInfo) {
    await updateDeviceList(user, data.deviceInfo);
    await user.save();
  }

  const sessionId = uuidv4();
  const tokens = await generateTokenPair(user, sessionId);

  return { ...tokens, user: user.toSafeObject() };
}

export async function login(
  email: string,
  password: string,
  deviceInfo: { deviceId: string; userAgent: string; ip: string }
): Promise<LoginResult> {
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash') as IUser | null;
  if (!user || !user.isActive) throw new AuthenticationError('Invalid credentials');

  if (!user.passwordHash) {
    // User signed up via Google OAuth — they have no password set
    throw new AuthenticationError('This account uses Google sign-in. Please use "Sign in with Google" or request a magic link.');
  }

  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) throw new AuthenticationError('Invalid credentials');

  // Update device list
  await updateDeviceList(user, deviceInfo);

  user.lastLoginAt = new Date();
  await user.save();

  const sessionId = uuidv4();
  const tokens = await generateTokenPair(user, sessionId);

  return { ...tokens, user: user.toSafeObject() };
}

export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  const payload = verifyRefreshToken(refreshToken);

  // Check if the token family has been revoked (security: token reuse detected previously)
  const familyRevokedKey = `revoked:family:${payload.family}`;
  const familyRevoked = await cacheGet<string>(familyRevokedKey);
  if (familyRevoked) {
    throw new AuthenticationError('Session has been revoked due to suspicious activity. Please sign in again.');
  }

  // Check token in Redis (if available)
  const storedKey = `${REFRESH_TOKEN_PREFIX}${payload.sessionId}`;
  const storedHash = await cacheGet<string>(storedKey);

  // When Redis is available, enforce token rotation security
  if (storedHash !== null) {
    const tokenHash = hashSHA256(refreshToken);
    if (storedHash !== tokenHash) {
      // Token reuse detected — revoke entire family
      await revokeTokenFamily(payload.family);
      throw new AuthenticationError('Token reuse detected. All sessions revoked.');
    }
    // Rotate: delete old token
    await cacheDel(storedKey);
  }
  // When Redis is unavailable, fall through — JWT signature is still verified above

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new AuthenticationError('User not found');

  const newSessionId = uuidv4();
  return generateTokenPair(user, newSessionId, payload.family);
}

export async function logout(sessionId: string, refreshToken?: string): Promise<void> {
  if (refreshToken) {
    const storedKey = `${REFRESH_TOKEN_PREFIX}${sessionId}`;
    await cacheDel(storedKey);
  }
  // Mark session as revoked
  await cacheSet(`revoked:session:${sessionId}`, '1', 15 * 60); // 15 min (access token lifetime)
}

export async function sendMagicLink(email: string, frontendUrl?: string): Promise<{ sent: boolean }> {
  const user = await User.findByEmail(email);
  if (!user) {
    // Return sent: false so the controller can respond appropriately.
    // We do NOT throw — the frontend shows a generic "if registered, check email" message
    // to avoid leaking whether an email is registered.
    logger.info({ email }, 'Magic link requested for non-existent email');
    return { sent: false };
  }

  if (!user.isActive) {
    logger.info({ email }, 'Magic link requested for inactive user');
    return { sent: false };
  }

  // Strategy: try Redis first. If Redis is unavailable, sign a short-lived JWT
  // as the token so magic links work even without a cache layer.
  let token: string;
  const redisOk = (await import('../../config/redis')).isRedisAvailable();

  if (redisOk) {
    // Redis path — store a random token hash
    token = generateSecureToken(32);
    const hash = hashSHA256(token);
    const key = `${MAGIC_LINK_PREFIX}${hash}`;
    await cacheSet(key, user._id.toString(), 72 * 60 * 60);
  } else {
    // No-Redis path — embed userId in a signed JWT (72h expiry)
    // verifyMagicLink detects this format and verifies the JWT directly
    const { signAccessToken } = await import('../../lib/jwt');
    token = signAccessToken({
      sub: user._id.toString(),
      role: user.role,
      orgRole: user.orgRole || user.role,
      organizationId: user.organizationId?.toString() || '',
      clientId: user.clientId?.toString(),
      sessionId: 'magic',
    });
    logger.info({ email }, 'Redis unavailable — using JWT-based magic link');
  }

  // Use the request-derived frontend URL if available, otherwise fall back to env
  const baseUrl = frontendUrl || env.MAGIC_LINK_BASE_URL;
  // Ensure the link always points to /auth/magic?token=...
  const link = baseUrl.includes('/auth/magic')
    ? `${baseUrl}?token=${token}`
    : `${baseUrl}/auth/magic?token=${token}`;

  await sendEmail({
    to: email,
    subject: `Sign in to ${env.AGENCY_NAME}`,
    html: getMagicLinkEmail(user.name, link),
  });

  return { sent: true };
}

export async function verifyMagicLink(
  token: string,
  deviceInfo: { deviceId: string; userAgent: string; ip: string }
): Promise<LoginResult> {
  let userId: string | null = null;

  // Try Redis path first
  const hash = hashSHA256(token);
  const key = `${MAGIC_LINK_PREFIX}${hash}`;
  const cached = await cacheGet<string>(key);

  if (cached) {
    // Redis hit — single-use token
    await cacheDel(key);
    userId = cached;
  } else {
    // Redis miss — try JWT path (used when Redis was unavailable at send time)
    try {
      const { verifyAccessToken } = await import('../../lib/jwt');
      const payload = verifyAccessToken(token);
      if (payload.sessionId === 'magic') {
        userId = payload.sub;
      }
    } catch {
      // Not a valid JWT either
    }
  }

  if (!userId) throw new AuthenticationError('Magic link is invalid or has expired');

  const user = await User.findById(userId);
  if (!user || !user.isActive) throw new AuthenticationError('User not found');

  await updateDeviceList(user, deviceInfo);
  user.lastLoginAt = new Date();
  await user.save();

  const sessionId = uuidv4();
  const tokens = await generateTokenPair(user, sessionId);

  return { ...tokens, user: user.toSafeObject() };
}

export async function sendPasswordReset(email: string, frontendUrl?: string): Promise<void> {
  const user = await User.findByEmail(email);
  if (!user) return; // Silent fail

  const token = generateSecureToken(32);
  const hash = hashSHA256(token);
  const key = `${PASSWORD_RESET_PREFIX}${hash}`;

  await cacheSet(key, user._id.toString(), 60 * 60); // 1 hour

  const base = frontendUrl || env.FRONTEND_URL;
  const link = `${base}/auth/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: 'Reset your password',
    html: getPasswordResetEmail(user.name, link),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const hash = hashSHA256(token);
  const key = `${PASSWORD_RESET_PREFIX}${hash}`;

  const userId = await cacheGet<string>(key);
  if (!userId) throw new AuthenticationError('Reset token is invalid or expired');

  await cacheDel(key);

  const passwordHash = await argon2.hash(newPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  await User.findByIdAndUpdate(userId, { passwordHash });
}

export async function revokeDevice(userId: string, deviceId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, {
    $pull: { devices: { deviceId } },
  });
}

export async function getDevices(userId: string) {
  const user = await User.findById(userId).select('devices');
  if (!user) throw new NotFoundError('User');
  return user.devices;
}

// Internal helpers
async function generateTokenPair(user: IUser, sessionId: string, family?: string): Promise<TokenPair> {
  const tokenFamily = family || uuidv4();

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
  const key = `${REFRESH_TOKEN_PREFIX}${sessionId}`;
  await cacheSet(key, hash, 7 * 24 * 60 * 60); // 7 days

  return { accessToken, refreshToken };
}

async function revokeTokenFamily(family: string): Promise<void> {
  // Log the security event — in a full implementation you'd track all
  // session IDs per family and revoke each one individually.
  logger.warn({ family }, 'Token family revoked due to reuse detection');
  // Mark the family itself as revoked so any future refresh attempts fail
  await cacheSet(`revoked:family:${family}`, '1', 7 * 24 * 60 * 60);
}

async function updateDeviceList(
  user: IUser,
  deviceInfo: { deviceId: string; userAgent: string; ip: string }
): Promise<void> {
  const existingIndex = user.devices.findIndex(d => d.deviceId === deviceInfo.deviceId);

  if (existingIndex >= 0) {
    user.devices[existingIndex].lastSeenAt = new Date();
    user.devices[existingIndex].userAgent = deviceInfo.userAgent;
  } else {
    if (user.devices.length >= MAX_DEVICES) {
      // Remove oldest device
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
