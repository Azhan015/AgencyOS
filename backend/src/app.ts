import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import passport from 'passport';
import { env } from './config/env';
import { requestId } from './middleware/requestId';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalLimiter, orgApiLimiter, strictLimiter } from './middleware/rateLimiter';
import { logger } from './lib/logger';
import { initPassport } from './lib/passport';
import { tenantScope } from './middleware/tenantScope';

// ── Route imports ──────────────────────────────────────────────────────────────
import authRoutes from './modules/auth/auth.routes';
import clientRoutes from './modules/clients/clients.routes';
import projectRoutes from './modules/projects/projects.routes';
import taskRoutes from './modules/tasks/tasks.routes';
import fileRoutes from './modules/files/files.routes';
import messageRoutes from './modules/messages/messages.routes';
import invoiceRoutes from './modules/invoices/invoices.routes';
import contractRoutes from './modules/contracts/contracts.routes';
import approvalRoutes from './modules/approvals/approvals.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import automationRoutes from './modules/automations/automations.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import adminRoutes from './modules/admin/admin.routes';
import platformRoutes from './modules/platform/platform.routes';
import organizationRoutes from './modules/organizations/organizations.routes';

const app = express();

// ── Trust proxy ────────────────────────────────────────────────────────────────
app.set('trust proxy', 1);

// ── Security headers ───────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ───────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'];
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Device-ID'],
}));

// ── Stripe webhook — raw body BEFORE json parser ───────────────────────────────
// Rate-limited separately — webhooks come from Stripe IPs only
app.use('/api/v1/invoices/webhooks/stripe', strictLimiter, express.raw({ type: 'application/json' }));
// Stripe subscription webhook (platform billing)
app.use('/api/platform/billing/webhook', strictLimiter, express.raw({ type: 'application/json' }));

// ── Body parsing ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

// ── Security ───────────────────────────────────────────────────────────────────
app.use(mongoSanitize());

// HPP — HTTP Parameter Pollution prevention
// Protects against attacks that send duplicate query params (e.g. ?role=CLIENT&role=ADMIN)
app.use(hpp());

// ── CSRF — double-submit cookie pattern ───────────────────────────────────────
// For state-mutating API routes called from browsers.
// The client must read the csrf-token cookie and send it back as X-CSRF-Token header.
// Skipped for: webhooks, auth endpoints (use Bearer tokens), non-browser clients.
import crypto from 'crypto';
app.use((req, res, next) => {
  // Only enforce on state-mutating methods from browser origins
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Skip webhooks and platform bootstrap (machine-to-machine)
  if (
    req.path.includes('/webhooks/') ||
    req.path === '/api/platform/bootstrap' ||
    req.path.startsWith('/api/platform/billing/webhook')
  ) return next();
  // Skip in test environment
  if (env.NODE_ENV === 'test') return next();

  // Issue a CSRF token cookie if not present
  if (!req.cookies['csrf-token']) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf-token', token, {
      httpOnly: false,   // Must be readable by JS
      sameSite: 'strict',
      secure: env.NODE_ENV === 'production',
    });
    // First request — no token to validate yet, allow through
    return next();
  }

  // Validate: header must match cookie
  const cookieToken = req.cookies['csrf-token'];
  const headerToken = req.headers['x-csrf-token'] as string | undefined;

  // Only enforce for requests that include Authorization (authenticated browser requests)
  // Machine-to-machine API calls (mobile apps, server-to-server) use Bearer tokens only
  if (req.headers.authorization && !headerToken) {
    // Bearer-token requests from non-browser clients are exempt
    return next();
  }

  if (headerToken && cookieToken && headerToken === cookieToken) {
    return next();
  }

  // If no Authorization header and no valid CSRF token — reject
  if (!req.headers.authorization && (!headerToken || headerToken !== cookieToken)) {
    res.status(403).json({
      success: false,
      error: { code: 'CSRF_VALIDATION_FAILED', message: 'CSRF token validation failed' },
    });
    return;
  }

  next();
});

// ── Passport (Google OAuth) ────────────────────────────────────────────────────
initPassport();
app.use(passport.initialize());

// ── Request ID ─────────────────────────────────────────────────────────────────
app.use(requestId);

// ── Rate limiting ──────────────────────────────────────────────────────────────
app.use('/api/', (req, res, next) => {
  if (req.path.includes('/invoices/webhooks/stripe')) return next();
  return generalLimiter(req, res, next);
});

// ── Health check (no auth) ─────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── Platform bootstrap (replaces legacy bootstrap-superadmin) ─────────────────
// Creates the first PLATFORM_OWNER account. Only works when no PlatformUser exists.
// POST /api/platform/bootstrap  { email, name, password }
// Once a PLATFORM_OWNER exists, this endpoint returns 403.
app.post('/api/platform/bootstrap', async (req, res, next) => {
  try {
    const { PlatformUser } = await import('./models/PlatformUser');
    const ownerCount = await PlatformUser.countDocuments({ platformRole: 'PLATFORM_OWNER' });
    if (ownerCount > 0) {
      res.status(403).json({
        success: false,
        error: { message: 'A PLATFORM_OWNER already exists.' },
      });
      return;
    }
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      res.status(400).json({
        success: false,
        error: { message: 'email, name, and password are required' },
      });
      return;
    }
    const argon2 = await import('argon2');
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    const owner = await PlatformUser.create({
      email: email.toLowerCase().trim(),
      name,
      passwordHash,
      platformRole: 'PLATFORM_OWNER',
    });
    logger.info({ email: owner.email }, 'Platform owner bootstrapped');
    res.status(201).json({
      success: true,
      data: owner.toSafeObject(),
      message: `Platform owner ${owner.email} created successfully`,
    });
  } catch (e) { next(e); }
});

// ── Legacy bootstrap-superadmin — REMOVED in Phase 8 ─────────────────────────
// Use POST /api/platform/bootstrap instead.
// The old endpoint has been removed to prevent privilege escalation in production.

// ── Dev-only: set password — handled in auth.routes.ts ────────────────────────
// Removed from app.ts to avoid duplicate route. See POST /api/v1/auth/dev-set-password

// ── API Routes ─────────────────────────────────────────────────────────────────
const apiPrefix = `/api/${env.API_VERSION}`;

// Auth routes — no tenantScope (handles unauthenticated flows)
app.use(`${apiPrefix}/auth`, authRoutes);

// Organization registration — public + authenticated self-service
// Must be before other org-scoped routes
app.use(`${apiPrefix}/organizations`, organizationRoutes);

// Org-scoped routes — tenantScope runs AFTER authenticate (which is inside each router)
// orgApiLimiter enforces plan-based request limits per organization
app.use(`${apiPrefix}/clients`, orgApiLimiter, clientRoutes);
app.use(`${apiPrefix}/projects`, orgApiLimiter, projectRoutes);
app.use(`${apiPrefix}/tasks`, orgApiLimiter, taskRoutes);
app.use(`${apiPrefix}/files`, orgApiLimiter, fileRoutes);
app.use(`${apiPrefix}/messages`, orgApiLimiter, messageRoutes);
app.use(`${apiPrefix}/invoices`, orgApiLimiter, invoiceRoutes);
app.use(`${apiPrefix}/contracts`, orgApiLimiter, contractRoutes);
app.use(`${apiPrefix}/approvals`, orgApiLimiter, approvalRoutes);
app.use(`${apiPrefix}/notifications`, orgApiLimiter, notificationRoutes);
app.use(`${apiPrefix}/automations`, orgApiLimiter, automationRoutes);
app.use(`${apiPrefix}/analytics`, orgApiLimiter, analyticsRoutes);
app.use(`${apiPrefix}/admin`, orgApiLimiter, adminRoutes);

// ── Platform routes (Phase 4) ──────────────────────────────────────────────────
// Separate auth domain — uses PLATFORM_JWT_ACCESS_SECRET, not JWT_ACCESS_SECRET
// No tenantScope — platform users operate above all tenants
app.use('/api/platform', platformRoutes);

// ── Error handlers ─────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
