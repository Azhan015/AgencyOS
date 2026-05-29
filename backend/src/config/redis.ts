import { createClient, RedisClientType } from 'redis';
import { env } from './env';
import { logger } from '../lib/logger';

let redisClient: RedisClientType | null = null;
let redisSubscriber: RedisClientType | null = null;
let redisPublisher: RedisClientType | null = null;
let redisAvailable = false;

/**
 * Build a redis client config from the URL.
 * Upstash (and any other TLS Redis) uses rediss:// — the `redis` npm client
 * needs socket.tls = true when the scheme is rediss://.
 */
function makeClientConfig(url: string) {
  const isTls = url.startsWith('rediss://');
  return {
    url,
    socket: {
      tls: isTls,
      // Upstash free tier closes idle connections after ~60 s.
      // Keep-alive pings prevent the "Socket closed unexpectedly" error.
      keepAlive: 10000,
      // Don't retry forever — fail fast so the server can still start.
      reconnectStrategy: (retries: number) => {
        if (retries >= 3) return new Error('Redis: max reconnect attempts reached');
        return Math.min(retries * 500, 2000);
      },
    },
  };
}

export async function connectRedis(): Promise<void> {
  try {
    const cfg = makeClientConfig(env.REDIS_URL);

    const client     = createClient(cfg) as RedisClientType;
    const subscriber = createClient(cfg) as RedisClientType;
    const publisher  = createClient(cfg) as RedisClientType;

    // Log errors but don't crash — the server runs fine without Redis
    client.on('error',     (err) => logger.warn({ err }, 'Redis client error'));
    subscriber.on('error', (err) => logger.warn({ err }, 'Redis subscriber error'));
    publisher.on('error',  (err) => logger.warn({ err }, 'Redis publisher error'));

    client.on('connect',     () => logger.info('✅ Redis connected'));
    client.on('reconnecting', () => logger.warn('Redis reconnecting...'));

    // Race the connection against a 5-second timeout so a bad URL doesn't
    // block the server from starting.
    const timeout = (ms: number) =>
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Redis connect timeout after ${ms}ms`)), ms)
      );

    await Promise.race([
      Promise.all([client.connect(), subscriber.connect(), publisher.connect()]),
      timeout(5000),
    ]);

    redisClient     = client;
    redisSubscriber = subscriber;
    redisPublisher  = publisher;
    redisAvailable  = true;

    logger.info('✅ Redis ready');
  } catch (err) {
    // Non-fatal — the app works without Redis (magic links fall back to JWT,
    // rate limiting falls back to in-memory, real-time features are degraded).
    logger.warn(
      { err },
      '⚠️  Redis unavailable — running without cache/sessions. ' +
      'Magic links, token rotation, and real-time features will be degraded. ' +
      'Check REDIS_URL (Upstash requires rediss://, not redis://).'
    );
    redisAvailable = false;
  }
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) throw new Error('Redis client not initialized');
  return redisClient;
}

export function getRedisSubscriber(): RedisClientType {
  if (!redisSubscriber) throw new Error('Redis subscriber not initialized');
  return redisSubscriber;
}

export function getRedisPublisher(): RedisClientType {
  if (!redisPublisher) throw new Error('Redis publisher not initialized');
  return redisPublisher;
}

export async function disconnectRedis(): Promise<void> {
  if (!redisAvailable) return;
  try {
    await Promise.all([
      redisClient?.quit(),
      redisSubscriber?.quit(),
      redisPublisher?.quit(),
    ]);
    logger.info('Redis disconnected');
  } catch {
    // Ignore disconnect errors during shutdown
  }
}

// ── Cache helpers — all gracefully no-op when Redis is unavailable ────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redisAvailable || !redisClient) return null;
  try {
    const value = await redisClient.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (!redisAvailable || !redisClient) return;
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await redisClient.setEx(key, ttlSeconds, serialized);
    } else {
      await redisClient.set(key, serialized);
    }
  } catch {
    // Silently ignore cache write failures
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (!redisAvailable || !redisClient) return;
  try {
    await redisClient.del(key);
  } catch {
    // Silently ignore
  }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  if (!redisAvailable || !redisClient) return;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch {
    // Silently ignore
  }
}

// ── Org-namespaced cache helpers ──────────────────────────────────────────────
// All keys follow: org:{orgId}:{subkey}
// Use these in service files instead of bare cacheGet/Set/Del for org-scoped data.

export async function orgCacheGet<T>(orgId: string, key: string): Promise<T | null> {
  return cacheGet<T>(`org:${orgId}:${key}`);
}

export async function orgCacheSet(
  orgId: string,
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  return cacheSet(`org:${orgId}:${key}`, value, ttlSeconds);
}

export async function orgCacheDel(orgId: string, ...keys: string[]): Promise<void> {
  if (!redisAvailable || !redisClient) return;
  try {
    const fullKeys = keys.map(k => `org:${orgId}:${k}`);
    await redisClient.del(fullKeys);
  } catch {
    // Silently ignore
  }
}

// ── Session tracking — used by authenticate.ts ────────────────────────────────
// Tracks active sessionIds per org so they can be bulk-revoked on suspension.

export async function trackOrgSession(orgId: string, sessionId: string): Promise<void> {
  if (!redisAvailable || !redisClient) return;
  try {
    const key = `org:sessions:${orgId}`;
    await redisClient.sAdd(key, sessionId);
    // TTL matches refresh token lifetime (7 days)
    await redisClient.expire(key, 7 * 24 * 3600);
  } catch {
    // Non-fatal
  }
}
