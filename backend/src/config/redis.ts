import { createClient, RedisClientType } from 'redis';
import { env } from './env';
import { logger } from '../lib/logger';

let redisClient: RedisClientType | null = null;
let redisSubscriber: RedisClientType | null = null;
let redisPublisher: RedisClientType | null = null;
let redisAvailable = false;

export async function connectRedis(): Promise<void> {
  try {
    const client = createClient({ url: env.REDIS_URL }) as RedisClientType;
    const subscriber = createClient({ url: env.REDIS_URL }) as RedisClientType;
    const publisher = createClient({ url: env.REDIS_URL }) as RedisClientType;

    client.on('error', (err) => logger.error({ err }, 'Redis client error'));
    client.on('connect', () => logger.info('✅ Redis connected'));
    client.on('reconnecting', () => logger.warn('Redis reconnecting...'));

    await Promise.all([
      client.connect(),
      subscriber.connect(),
      publisher.connect(),
    ]);

    redisClient = client;
    redisSubscriber = subscriber;
    redisPublisher = publisher;
    redisAvailable = true;
  } catch (err) {
    logger.warn(
      { err },
      '⚠️  Redis not available — running without cache/sessions. ' +
      'Rate limiting, token storage, and real-time features will be degraded. ' +
      'Start Redis or set REDIS_URL to a running instance.'
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
  await Promise.all([
    redisClient?.quit(),
    redisSubscriber?.quit(),
    redisPublisher?.quit(),
  ]);
  logger.info('Redis disconnected');
}

// Cache helpers — all gracefully no-op when Redis is unavailable
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
