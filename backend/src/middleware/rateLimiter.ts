import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { isRedisAvailable, getRedisClient } from '../config/redis';
import { RateLimitError } from '../lib/errors';
import type { OrgPlan } from '../models/Organization';

// ── Standard Express rate limiters ────────────────────────────────────────────

export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later' },
  },
  skip: () => env.NODE_ENV === 'test',
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many authentication attempts' },
  },
  skip: () => env.NODE_ENV === 'test',
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many upload requests' },
  },
  skip: () => env.NODE_ENV === 'test',
});

export const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
  },
  skip: () => env.NODE_ENV === 'test',
});

// 3 org registrations per IP per hour — abuse prevention
export const orgRegistrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many registration attempts. Try again in an hour.' },
  },
  skip: () => env.NODE_ENV === 'test',
});

// ── Org-level API rate limiter ─────────────────────────────────────────────────
// Plan-based limits per organization per minute.
// Must run AFTER authenticate + tenantScope (requires req.user + req.organization).

const PLAN_LIMITS: Record<OrgPlan, number> = {
  TRIAL: 60,
  STARTER: 300,
  GROWTH: 1000,
  ENTERPRISE: 5000,
};

export async function orgApiLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip in test, skip platform users, skip if no org context
  if (env.NODE_ENV === 'test') return next();
  if (!req.user) return next();

  const isPlatform = (req.user as unknown as { isPlatformUser: boolean }).isPlatformUser;
  if (isPlatform) return next();

  const orgId = req.user.organizationId;
  if (!orgId) return next();

  // Degrade gracefully when Redis is unavailable
  if (!isRedisAvailable()) return next();

  try {
    const plan = (req.organization?.plan ?? 'TRIAL') as OrgPlan;
    const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.TRIAL;
    const redis = getRedisClient();

    const limitKey = `rate:api:${orgId}`;
    const current = await redis.incr(limitKey);
    if (current === 1) await redis.expire(limitKey, 60); // 1-minute window

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current));
    res.setHeader('X-RateLimit-Plan', plan);

    if (current > limit) {
      next(new RateLimitError(
        `Organization API limit exceeded (${limit} req/min for ${plan} plan). Upgrade to increase your limit.`
      ));
      return;
    }
  } catch {
    // Non-fatal — never block a request due to rate limit infrastructure errors
  }

  next();
}
