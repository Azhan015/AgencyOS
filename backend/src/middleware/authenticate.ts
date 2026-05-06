import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../lib/jwt';
import { AuthenticationError } from '../lib/errors';
import { User } from '../models/User';
import { cacheGet, cacheSet } from '../config/redis';

// AuthRequest is just an alias for Request (user is on the global Express.User type)
export type AuthRequest = Request;

export async function authenticate(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
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
    let userData = await cacheGet<{ id: string; email: string; role: string; clientId?: string; name: string }>(cacheKey);

    if (!userData) {
      const user = await User.findById(payload.sub).select('email role clientId isActive name');
      if (!user || !user.isActive) {
        throw new AuthenticationError('User not found or inactive');
      }
      userData = {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        clientId: user.clientId?.toString(),
        name: user.name,
      };
      await cacheSet(cacheKey, userData, 300); // 5 min cache
    }

    req.user = {
      ...userData,
      sessionId: payload.sessionId,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function optionalAuthenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }
  authenticate(req, res, next);
}
