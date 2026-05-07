/**
 * bullRedis.ts
 *
 * Returns the ioredis connection options that Bull needs.
 * Bull uses ioredis internally, which requires a different config shape
 * from the `redis` npm client used by the rest of the app.
 *
 * Key difference: Upstash (and any TLS Redis) uses rediss:// — ioredis
 * needs `tls: {}` in the options object, not just the URL scheme.
 */
import { env } from './env';

export interface BullRedisOptions {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: object;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
}

export function getBullRedisOptions(): BullRedisOptions {
  const url = env.REDIS_URL;

  try {
    const parsed = new URL(url);
    const isTls = parsed.protocol === 'rediss:';

    const opts: BullRedisOptions = {
      host: parsed.hostname,
      port: Number(parsed.port) || (isTls ? 6380 : 6379),
      // Bull/ioredis doesn't handle connection failures gracefully by default
      maxRetriesPerRequest: null as unknown as number, // null = retry forever (Bull manages this)
      enableReadyCheck: false,
    };

    if (parsed.password) opts.password = decodeURIComponent(parsed.password);
    if (parsed.username && parsed.username !== 'default') opts.username = parsed.username;
    if (isTls) opts.tls = {}; // enable TLS for rediss:// URLs

    return opts;
  } catch {
    // Fallback for malformed URLs
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null as unknown as number,
      enableReadyCheck: false,
    };
  }
}
