import { Request, Response, NextFunction } from 'express';
import {
  verifyAccessToken,
  verifyPlatformAccessToken,
  AccessTokenPayload,
} from '../lib/jwt';
import { AuthenticationError } from '../lib/errors';
import { User } from '../models/User';
import { PlatformUser } from '../models/PlatformUser';
import { cacheGet, cacheSet, isRedisAvailable, getRedisClient } from '../config/redis';
export type AuthRequest = Request;

// ── Cached user shape stored in Redis ─────────────────────────────────────────

interface CachedOrgUser {
  id: string;
  email: string;
  role: string;
  orgRole: string;
  organizationId: string;
  clientId?: string;
  name: string;
}

interface CachedPlatformUser {
  id: string;
  email: string;
  platformRole: string;
  name: string;
}

// ── Org-user authentication ────────────────────────────────────────────────────

export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    // Check if session is revoked
    const revokedKey = `revoked:session:${payload.sessionId}`;
    const isRevoked = await cacheGet<string>(revokedKey);
    if (isRevoked) {
      throw new AuthenticationError('Session has been revoked');
    }

    // Try cache first
    const cacheKey = `user:${payload.sub}`;
    let userData = await cacheGet<CachedOrgUser>(cacheKey);

    if (!userData) {
      const user = await User.findById(payload.sub).select(
        'email role orgRole organizationId clientId isActive name'
      );
      if (!user || !user.isActive) {
        throw new AuthenticationError('User not found or inactive');
      }
      userData = {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        orgRole: user.orgRole,
        organizationId: user.organizationId?.toString() ?? '',
        clientId: user.clientId?.toString(),
        name: user.name,
      };
      await cacheSet(cacheKey, userData, 300); // 5-min cache
    }

    req.user = {
      ...userData,
      sessionId: payload.sessionId,
      isPlatformUser: false,
    } as Express.User;

    // Track session in org SET for bulk revocation on org suspension (fire-and-forget)
    const orgIdForTracking = userData?.organizationId;
    if (orgIdForTracking) {
      const sessionIdForTracking = payload.sessionId;
      // Fully wrapped — never throws, never blocks the request
      Promise.resolve().then(async () => {
        if (!isRedisAvailable()) return;
        try {
          const redis = getRedisClient();
          const key = `org:sessions:${orgIdForTracking}`;
          await redis.sAdd(key, sessionIdForTracking);
          await redis.expire(key, 7 * 24 * 3600);
        } catch {
          // Non-fatal
        }
      }).catch(() => { /* Non-fatal */ });
    }

    next();
  } catch (error) {
    next(error);
  }
}

// ── Platform-user authentication ───────────────────────────────────────────────

export async function authenticatePlatform(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Platform token required');
    }

    const token = authHeader.slice(7);
    const decoded = verifyPlatformAccessToken(token);

    // Check revocation list (platform-namespaced)
    const isRevoked = await cacheGet<string>(`platform:revoked:session:${decoded.sessionId}`);
    if (isRevoked) {
      throw new AuthenticationError('Platform session has been revoked');
    }

    // Load platform user from cache or DB
    const cacheKey = `platform:user:${decoded.sub}`;
    let platformUserData = await cacheGet<CachedPlatformUser>(cacheKey);

    if (!platformUserData) {
      const platformUser = await PlatformUser.findById(decoded.sub).select(
        'email platformRole isActive name'
      );
      if (!platformUser || !platformUser.isActive) {
        throw new AuthenticationError('Platform user not found or deactivated');
      }
      platformUserData = {
        id: platformUser._id.toString(),
        email: platformUser.email,
        platformRole: platformUser.platformRole,
        name: platformUser.name,
      };
      await cacheSet(cacheKey, platformUserData, 300); // 5-min cache
    }

    req.user = {
      ...platformUserData,
      sessionId: decoded.sessionId,
      isPlatformUser: true,
      impersonating: decoded.impersonating
        ? {
            organizationId: decoded.impersonating.organizationId,
            originalPlatformUserId: decoded.impersonating.originalPlatformUserId,
            grantedAt: new Date(decoded.impersonating.grantedAt),
          }
        : undefined,
    } as unknown as Express.User;

    next();
  } catch (error) {
    next(error);
  }
}

// ── Optional org-user authentication ──────────────────────────────────────────

export function optionalAuthenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }
  authenticate(req, res, next);
}
