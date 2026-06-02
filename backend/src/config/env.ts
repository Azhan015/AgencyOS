import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000').transform(Number),
  API_VERSION: z.string().default('v1'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // Database
  MONGODB_URI: z.string().min(1, 'MongoDB URI is required'),
  MONGODB_URI_TEST: z.string().optional(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT access secret must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT refresh secret must be at least 32 chars'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Platform JWT (separate secrets for platform admin layer)
  // Required in production — defaults provided for development only
  PLATFORM_JWT_ACCESS_SECRET: z.string().min(32, 'Platform JWT access secret must be at least 32 chars').default('platform-access-secret-change-in-production-min32'),
  PLATFORM_JWT_REFRESH_SECRET: z.string().min(32, 'Platform JWT refresh secret must be at least 32 chars').default('platform-refresh-secret-change-in-production-min32'),

  // AWS S3
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_BUCKET: z.string().default('agency-os-files'),

  // Cloudflare R2
  R2_ENDPOINT: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Stripe Price IDs (per plan × interval)
  STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STARTER_ANNUAL: z.string().optional(),
  STRIPE_PRICE_GROWTH_MONTHLY: z.string().optional(),
  STRIPE_PRICE_GROWTH_ANNUAL: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE_ANNUAL: z.string().optional(),

  // Stripe Subscription Webhook Secret (separate from invoice webhook)
  STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: z.string().optional(),

  // Razorpay
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),

  // Email
  EMAIL_FROM: z.string().default('noreply@agencyos.com'),
  EMAIL_FROM_NAME: z.string().default('Agency OS'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional().transform(v => v ? Number(v) : 587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SES_REGION: z.string().optional(),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),

  // Sentry
  SENTRY_DSN: z.string().optional(),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32).optional(),

  // Magic Link
  MAGIC_LINK_EXPIRY: z.string().default('72h'),
  MAGIC_LINK_BASE_URL: z.string().default('http://localhost:3000/auth/magic'),

  // File Upload
  MAX_FILE_SIZE_BYTES: z.string().default('2147483648').transform(Number),
  VIRUS_SCAN_ENABLED: z.string().default('false').transform(v => v === 'true'),
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.string().default('3310').transform(Number),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('200').transform(Number),

  // Session
  SESSION_SECRET: z.string().default('session-secret-change-in-production'),
  COOKIE_DOMAIN: z.string().default('localhost'),

  // CDN
  CDN_URL: z.string().optional(),

  // App
  AGENCY_NAME: z.string().default('Agency OS'),
  AGENCY_EMAIL: z.string().default('hello@agencyos.com'),
  AGENCY_LOGO_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.error((parsed as any).error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
