/**
 * Platform Billing Routes
 *
 * Platform-admin routes for subscription management:
 *   POST /api/platform/billing/webhook          — Stripe subscription webhook (raw body)
 *   GET  /api/platform/billing/plans            — Available plans + price IDs
 *
 * Org-self-service billing routes (mounted under /api/v1/organizations/billing):
 *   These are handled in organizations.routes.ts — see:
 *     POST /api/v1/organizations/billing/checkout
 *     POST /api/v1/organizations/billing/portal
 *     POST /api/v1/organizations/billing/cancel
 *
 * Platform-admin override routes (require authenticatePlatform):
 *   POST /api/platform/billing/orgs/:orgId/change-plan
 *   POST /api/platform/billing/orgs/:orgId/cancel
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticatePlatform } from '../../../middleware/authenticate';
import { authorize } from '../../../middleware/authorize';
import { validateBody } from '../../../middleware/validate';
import { constructWebhookEvent } from '../../../lib/stripe';
import { logger } from '../../../lib/logger';
import * as service from './platform.billing.service';

const router = Router();

// ── Stripe subscription webhook (raw body — no auth) ──────────────────────────
// Mounted BEFORE authenticatePlatform so raw body is preserved.
// app.ts must mount this route with express.raw() before express.json().
router.post('/webhook', async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    const event = constructWebhookEvent(req.body as Buffer, sig);
    await service.handleSubscriptionWebhook(event);
    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, 'Stripe subscription webhook error');
    res.status(400).json({ error: 'Webhook error' });
  }
});

// ── All routes below require platform auth ─────────────────────────────────────
router.use(authenticatePlatform);

// ── Available plans ────────────────────────────────────────────────────────────
router.get('/plans', authorize('billing:read'), (_req, res) => {
  const { env } = require('../../../config/env');
  res.json({
    success: true,
    data: {
      STARTER: {
        monthly: env.STRIPE_PRICE_STARTER_MONTHLY ?? null,
        annual:  env.STRIPE_PRICE_STARTER_ANNUAL  ?? null,
      },
      GROWTH: {
        monthly: env.STRIPE_PRICE_GROWTH_MONTHLY ?? null,
        annual:  env.STRIPE_PRICE_GROWTH_ANNUAL  ?? null,
      },
      ENTERPRISE: {
        monthly: env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? null,
        annual:  env.STRIPE_PRICE_ENTERPRISE_ANNUAL  ?? null,
      },
    },
  });
});

// ── Platform admin: change org plan ───────────────────────────────────────────
router.post(
  '/orgs/:orgId/change-plan',
  authorize('billing:write'),
  validateBody(z.object({
    plan: z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']),
    interval: z.enum(['monthly', 'annual']),
  })),
  async (req, res, next) => {
    try {
      const actorId = (req.user as unknown as Express.PlatformUser).id;
      await service.changeOrgPlan(
        req.params.orgId,
        req.body.plan,
        req.body.interval,
        actorId,
        true // isPlatformAction
      );
      res.json({ success: true, message: 'Plan updated' });
    } catch (e) { next(e); }
  }
);

// ── Platform admin: cancel org subscription ───────────────────────────────────
router.post(
  '/orgs/:orgId/cancel',
  authorize('billing:write'),
  validateBody(z.object({
    immediate: z.boolean().default(false),
  })),
  async (req, res, next) => {
    try {
      const actorId = (req.user as unknown as Express.PlatformUser).id;
      await service.cancelOrgSubscription(req.params.orgId, actorId, req.body.immediate);
      res.json({ success: true, message: 'Subscription cancelled' });
    } catch (e) { next(e); }
  }
);

export default router;
