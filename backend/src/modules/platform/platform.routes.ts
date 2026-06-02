/**
 * Platform Admin Router
 *
 * Mounts all platform-level sub-modules under /api/platform/
 * All routes require platform JWT authentication (separate from org-user JWT).
 *
 * Route structure:
 *   /api/platform/auth/*           — Platform user login/refresh/logout
 *   /api/platform/organizations/*  — Org management (approve/reject/suspend)
 *   /api/platform/analytics/*      — Platform-wide metrics
 *   /api/platform/users/*          — Platform user management
 *   /api/platform/impersonation/*  — Impersonation system
 *   /api/platform/billing/*        — Subscription management + Stripe webhook
 */
import { Router } from 'express';
import platformAuthRoutes from './auth/platform.auth.routes';
import platformOrgRoutes from './organizations/platform.organizations.routes';
import platformAnalyticsRoutes from './analytics/platform.analytics.routes';
import platformUsersRoutes from './users/platform.users.routes';
import platformImpersonationRoutes from './impersonation/platform.impersonation.routes';
import platformBillingRoutes from './billing/platform.billing.routes';
import platformFlagsRoutes from './flags/platform.flags.routes';

const router = Router();

router.use('/auth', platformAuthRoutes);
router.use('/organizations', platformOrgRoutes);
router.use('/analytics', platformAnalyticsRoutes);
router.use('/users', platformUsersRoutes);
router.use('/impersonation', platformImpersonationRoutes);
router.use('/billing', platformBillingRoutes);
router.use('/flags', platformFlagsRoutes);

export default router;
