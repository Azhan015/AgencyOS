import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import passport from 'passport';
import { env } from './config/env';
import { requestId } from './middleware/requestId';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimiter';
import { logger } from './lib/logger';
import { initPassport } from './lib/passport';

// Route imports
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

const app = express();

// Trust proxy (for correct IP behind load balancer)
app.set('trust proxy', 1);

// Security headers
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

// CORS
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

// Stripe webhook needs raw body — must be before json parser
app.use('/api/v1/invoices/webhooks/stripe', express.raw({ type: 'application/json' }));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

// Security
app.use(mongoSanitize());

// Initialize Passport (Google OAuth)
initPassport();
app.use(passport.initialize());

// Request ID
app.use(requestId);

// Rate limiting — skip Stripe webhook endpoint
app.use('/api/', (req, res, next) => {
  if (req.path.includes('/invoices/webhooks/stripe')) return next();
  return generalLimiter(req, res, next);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Bootstrap superadmin — only works when NO superadmin exists in the DB.
// Call: POST /api/v1/auth/bootstrap-superadmin  { email: "you@example.com" }
// This promotes the user with that email to SUPERADMIN.
// Once a SUPERADMIN exists this endpoint returns 403.
app.post(`/api/${env.API_VERSION}/auth/bootstrap-superadmin`, async (req, res, next) => {
  try {
    const { User } = await import('./models/User');
    const superadminCount = await User.countDocuments({ role: 'SUPERADMIN' });
    if (superadminCount > 0) {
      res.status(403).json({ success: false, error: { message: 'A SUPERADMIN already exists. Use the admin panel to promote users.' } });
      return;
    }
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, error: { message: 'email is required' } });
      return;
    }
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { role: 'SUPERADMIN' },
      { new: true }
    ).select('-passwordHash');
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'No user found with that email. Register first.' } });
      return;
    }
    res.json({ success: true, data: user, message: `${user.name} (${user.email}) has been promoted to SUPERADMIN` });
  } catch (e) { next(e); }
});

// ── Dev-only: set password directly without email/Redis ──────────────────────
// Use this when you're locked out and can't receive reset emails.
// Only works in NODE_ENV=development. Disabled in production automatically.
// Call: POST /api/v1/auth/dev-set-password  { email: "you@example.com", password: "newpassword" }
app.post(`/api/${env.API_VERSION}/auth/dev-set-password`, async (req, res, next) => {
  try {
    if (env.NODE_ENV !== 'development') {
      res.status(403).json({ success: false, error: { message: 'Only available in development mode' } });
      return;
    }
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: { message: 'email and password are required' } });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ success: false, error: { message: 'password must be at least 8 characters' } });
      return;
    }
    const { User } = await import('./models/User');
    const argon2 = await import('argon2');
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { passwordHash },
      { new: true }
    ).select('-passwordHash');
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'No user found with that email' } });
      return;
    }
    res.json({ success: true, message: `Password set for ${user.email}. You can now sign in with email + password.` });
  } catch (e) { next(e); }
});

// API Routes
const apiPrefix = `/api/${env.API_VERSION}`;

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/clients`, clientRoutes);
app.use(`${apiPrefix}/projects`, projectRoutes);
app.use(`${apiPrefix}/tasks`, taskRoutes);
app.use(`${apiPrefix}/files`, fileRoutes);
app.use(`${apiPrefix}/messages`, messageRoutes);
app.use(`${apiPrefix}/invoices`, invoiceRoutes);
app.use(`${apiPrefix}/contracts`, contractRoutes);
app.use(`${apiPrefix}/approvals`, approvalRoutes);
app.use(`${apiPrefix}/notifications`, notificationRoutes);
app.use(`${apiPrefix}/automations`, automationRoutes);
app.use(`${apiPrefix}/analytics`, analyticsRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
