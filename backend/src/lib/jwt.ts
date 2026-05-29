import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticationError } from './errors';

// ── Org-user token payloads ────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string;          // userId
  role: string;         // legacy role (backward compat)
  orgRole: string;      // new org-scoped role
  organizationId: string;
  clientId?: string;
  sessionId: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  family: string;
  organizationId: string;
  type: 'refresh';
}

// ── Platform-user token payloads ──────────────────────────────────────────────

export interface PlatformAccessTokenPayload {
  sub: string;          // PlatformUser._id
  platformRole: string;
  sessionId: string;
  type: 'platform_access';
  impersonating?: {
    organizationId: string;
    originalPlatformUserId: string;
    grantedAt: number;  // Unix timestamp
  };
}

export interface PlatformRefreshTokenPayload {
  sub: string;
  sessionId: string;
  family: string;
  type: 'platform_refresh';
}

// ── Org-user token functions ───────────────────────────────────────────────────

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRY as string }
  );
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRY as string }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    if (payload.type !== 'access') throw new AuthenticationError('Invalid token type');
    return payload;
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    if (error instanceof jwt.TokenExpiredError) throw new AuthenticationError('Token expired');
    if (error instanceof jwt.JsonWebTokenError) throw new AuthenticationError('Invalid token');
    throw new AuthenticationError('Token verification failed');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    if (payload.type !== 'refresh') throw new AuthenticationError('Invalid token type');
    return payload;
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    if (error instanceof jwt.TokenExpiredError) throw new AuthenticationError('Refresh token expired');
    if (error instanceof jwt.JsonWebTokenError) throw new AuthenticationError('Invalid refresh token');
    throw new AuthenticationError('Refresh token verification failed');
  }
}

// ── Platform-user token functions ─────────────────────────────────────────────

export function signPlatformAccessToken(
  payload: Omit<PlatformAccessTokenPayload, 'type'>
): string {
  return jwt.sign(
    { ...payload, type: 'platform_access' },
    env.PLATFORM_JWT_ACCESS_SECRET,
    { expiresIn: '15m', issuer: 'agencyos-platform' }
  );
}

export function signPlatformRefreshToken(
  payload: Omit<PlatformRefreshTokenPayload, 'type'>
): string {
  return jwt.sign(
    { ...payload, type: 'platform_refresh' },
    env.PLATFORM_JWT_REFRESH_SECRET,
    { expiresIn: '7d', issuer: 'agencyos-platform' }
  );
}

export function verifyPlatformAccessToken(token: string): PlatformAccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.PLATFORM_JWT_ACCESS_SECRET, {
      issuer: 'agencyos-platform',
    }) as PlatformAccessTokenPayload;
    if (payload.type !== 'platform_access') throw new AuthenticationError('Invalid platform token type');
    return payload;
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    if (error instanceof jwt.TokenExpiredError) throw new AuthenticationError('Platform token expired');
    if (error instanceof jwt.JsonWebTokenError) throw new AuthenticationError('Invalid platform token');
    throw new AuthenticationError('Platform token verification failed');
  }
}

export function verifyPlatformRefreshToken(token: string): PlatformRefreshTokenPayload {
  try {
    const payload = jwt.verify(token, env.PLATFORM_JWT_REFRESH_SECRET, {
      issuer: 'agencyos-platform',
    }) as PlatformRefreshTokenPayload;
    if (payload.type !== 'platform_refresh') throw new AuthenticationError('Invalid platform refresh token type');
    return payload;
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    if (error instanceof jwt.TokenExpiredError) throw new AuthenticationError('Platform refresh token expired');
    if (error instanceof jwt.JsonWebTokenError) throw new AuthenticationError('Invalid platform refresh token');
    throw new AuthenticationError('Platform refresh token verification failed');
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function decodeToken(token: string): Record<string, unknown> | null {
  return jwt.decode(token) as Record<string, unknown> | null;
}
