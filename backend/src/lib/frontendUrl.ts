/**
 * frontendUrl.ts
 *
 * Resolves the correct frontend base URL for email links.
 *
 * The problem: the backend can be called from two different frontend origins:
 *   - http://localhost:5173  (Vite dev server — npm run dev)
 *   - http://localhost:3000  (Docker nginx — docker-compose up)
 *
 * Strategy (in priority order):
 *   1. If a request object is available, use its Origin header — this is always
 *      the exact URL the browser is currently using, so links in emails will
 *      always match the running environment.
 *   2. Fall back to FRONTEND_URL env var (used by scheduled jobs / background
 *      workers that have no request context).
 *
 * Usage:
 *   import { getFrontendUrl } from '../../lib/frontendUrl';
 *
 *   // In a route handler (has req):
 *   const base = getFrontendUrl(req);
 *
 *   // In a service / worker (no req):
 *   const base = getFrontendUrl();
 */

import { Request } from 'express';
import { env } from '../config/env';

/** Known local frontend origins — accepted even if not in FRONTEND_URL */
const LOCAL_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]);

export function getFrontendUrl(req?: Request): string {
  if (req) {
    // 1. Origin header — set by browsers on cross-origin requests (most reliable)
    const origin = req.headers.origin;
    if (origin && (LOCAL_ORIGINS.has(origin) || origin === env.FRONTEND_URL)) {
      return origin.replace(/\/$/, ''); // strip trailing slash
    }

    // 2. Referer header — fallback, strip path to get just the origin
    const referer = req.headers.referer;
    if (referer) {
      try {
        const url = new URL(referer);
        const refOrigin = `${url.protocol}//${url.host}`;
        if (LOCAL_ORIGINS.has(refOrigin) || refOrigin === env.FRONTEND_URL) {
          return refOrigin;
        }
      } catch {
        // invalid URL — ignore
      }
    }
  }

  // 3. Env var fallback
  return env.FRONTEND_URL.replace(/\/$/, '');
}
