import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticationError } from './errors';

export interface AccessTokenPayload {
  sub: string;       // userId
  role: string;
  clientId?: string;
  sessionId: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  family: string;
  type: 'refresh';
}

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

export function decodeToken(token: string): Record<string, unknown> | null {
  return jwt.decode(token) as Record<string, unknown> | null;
}
