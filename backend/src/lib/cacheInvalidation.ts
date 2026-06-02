/**
 * Cache Invalidation Groups
 *
 * Defines named invalidation groups so related caches are cleared together.
 * All helpers use the org-namespaced key pattern: org:{orgId}:{entity}:{id}
 */

import { cacheDelPattern, getRedisClient } from '../config/redis';
import { logger } from './logger';

// ── Internal multi-key delete ──────────────────────────────────────────────────

async function cacheDelMany(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const redis = getRedisClient();
    await redis.del(keys);
  } catch { /* non-fatal */ }
}

// ── Invalidation group definitions ────────────────────────────────────────────

export const CacheGroups = {
  /** Invalidate a single user's cached doc */
  user: (orgId: string, userId: string): string[] => [
    `org:${orgId}:user:${userId}`,
    `user:${userId}`,                    // legacy key (backward compat)
  ],

  /** Invalidate project + its analytics */
  project: (orgId: string, projectId: string): string[] => [
    `org:${orgId}:project:${projectId}`,
    `org:${orgId}:project:${projectId}:health`,
    `org:${orgId}:analytics:project:${projectId}`,
    `org:${orgId}:analytics:agency`,
    `project:${projectId}`,              // legacy key
  ],

  /** Invalidate client + its analytics */
  client: (orgId: string, clientId: string): string[] => [
    `org:${orgId}:client:${clientId}`,
    `org:${orgId}:analytics:client:${clientId}`,
    `org:${orgId}:analytics:agency`,
    `client:${clientId}`,                // legacy key
  ],

  /** Invalidate all org-level analytics caches */
  orgAnalytics: (orgId: string): string[] => [
    `org:${orgId}:analytics:agency`,
    `org:${orgId}:analytics`,
  ],

  /** Invalidate org metadata (after status/plan/feature change) */
  orgMeta: (orgId: string): string[] => [
    `org:${orgId}:meta`,
    `org:${orgId}:storage-usage`,
  ],
};

// ── Batch invalidation helper ──────────────────────────────────────────────────

export async function invalidateCache(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await cacheDelMany(keys);
  } catch (err) {
    logger.warn({ err, keys }, 'Cache invalidation failed (non-fatal)');
  }
}

// ── Org-wide cache purge (on suspension/deletion) ─────────────────────────────

export async function purgeOrgCache(orgId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys(`org:${orgId}:*`);
    if (keys.length > 0) {
      await redis.del(keys);
      logger.info({ orgId, keysDeleted: keys.length }, 'Org cache purged');
    }
  } catch (err) {
    logger.warn({ err, orgId }, 'Org cache purge failed (non-fatal)');
  }
}

// ── Org session bulk invalidation (on suspension) ─────────────────────────────

export async function invalidateOrgSessions(orgId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const sessionSetKey = `org:sessions:${orgId}`;
    const sessionIds = await redis.sMembers(sessionSetKey);

    if (sessionIds.length === 0) return;

    const pipeline = redis.multi();
    for (const sessionId of sessionIds) {
      pipeline.setEx(`revoked:session:${sessionId}`, 86400, '1');
    }
    pipeline.del(sessionSetKey);
    await pipeline.exec();

    logger.info({ orgId, sessionsRevoked: sessionIds.length }, 'Org sessions invalidated');
  } catch (err) {
    logger.warn({ err, orgId }, 'Org session invalidation failed (non-fatal)');
  }
}

// Re-export for convenience
export { cacheDelPattern };
