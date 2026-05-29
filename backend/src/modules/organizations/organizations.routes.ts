/**
 * Organizations Module Routes
 *
 * Public:
 *   POST /register          — Register a new organization
 *   GET  /verify-slug       — Check slug availability
 *   GET  /status/:slug      — Check registration status
 *
 * Authenticated (org-scoped):
 *   GET  /                  — Get own org detail
 *   PATCH /                 — Update org profile
 *   GET  /usage             — Current usage vs limits
 *   GET  /billing           — Billing info
 *   POST /invite-user       — Invite team member
 *   POST /transfer-ownership — Transfer ownership (ORGANIZATION_OWNER only)
 *   DELETE /                — Request org deletion (ORGANIZATION_OWNER only)
 */

import { Router } from 'express';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantScope } from '../../middleware/tenantScope';
import { validateBody, validateQuery } from '../../middleware/validate';
import { orgRegistrationLimiter, strictLimiter } from '../../middleware/rateLimiter';
import { z } from 'zod';import {
  RegisterOrganizationSchema,
  UpdateOrganizationSchema,
  InviteUserSchema,
  TransferOwnershipSchema,
  RequestDeletionSchema,
} from './organizations.schemas';
import * as service from './organizations.service';
import { getFrontendUrl } from '../../lib/frontendUrl';

const router = Router();

// ── Public routes ──────────────────────────────────────────────────────────────

/**
 * POST /api/v1/organizations/register
 * Public — register a new organization + owner account
 */
router.post(
  '/register',
  orgRegistrationLimiter,
  validateBody(RegisterOrganizationSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      const userAgent = req.headers['user-agent'] ?? '';
      const result = await service.registerOrganization(req.body, ip, userAgent);
      res.status(201).json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

/**
 * GET /api/v1/organizations/verify-slug?slug=acme-agency
 * Public — check if a slug is available
 */
router.get(
  '/verify-slug',
  validateQuery(z.object({ slug: z.string().min(3).max(50) })),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await service.checkSlugAvailability(req.query.slug as string);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

/**
 * GET /api/v1/organizations/status/:slug
 * Public — check registration status (for pending/rejected pages)
 */
router.get(
  '/status/:slug',
  async (req: AuthRequest, res, next) => {
    try {
      const result = await service.getRegistrationStatus(req.params.slug);
      if (!result) {
        res.status(404).json({ success: false, error: { message: 'Organization not found' } });
        return;
      }
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

// ── Authenticated routes — all require authenticate + tenantScope ──────────────

router.use(authenticate, tenantScope);

/**
 * GET /api/v1/organizations
 * Returns the authenticated user's organization detail
 */
router.get(
  '/',
  authorize('settings:read'),
  async (req: AuthRequest, res, next) => {
    try {
      const org = await service.getOwnOrganization(req.user!.organizationId);
      res.json({ success: true, data: org });
    } catch (e) { next(e); }
  }
);

/**
 * PATCH /api/v1/organizations
 * Update org profile (name, logo, address, etc.)
 */
router.patch(
  '/',
  authorize('settings:write'),
  validateBody(UpdateOrganizationSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const org = await service.updateOrganization(
        req.user!.organizationId,
        req.body,
        req.user!.id
      );
      res.json({ success: true, data: org });
    } catch (e) { next(e); }
  }
);

/**
 * GET /api/v1/organizations/usage
 * Current usage vs plan limits
 */
router.get(
  '/usage',
  async (req: AuthRequest, res, next) => {
    try {
      const usage = await service.getOrganizationUsage(req.user!.organizationId);
      res.json({ success: true, data: usage });
    } catch (e) { next(e); }
  }
);

/**
 * GET /api/v1/organizations/billing
 * Billing info — plan, subscription, MRR, trial dates
 */
router.get(
  '/billing',
  authorize('billing:read'),
  async (req: AuthRequest, res, next) => {
    try {
      const billing = await service.getOrganizationBilling(req.user!.organizationId);
      res.json({ success: true, data: billing });
    } catch (e) { next(e); }
  }
);

/**
 * POST /api/v1/organizations/invite-user
 * Invite a new team member (ORGANIZATION_OWNER or ORGANIZATION_ADMIN)
 */
router.post(
  '/invite-user',
  authorize('team:write'),
  validateBody(InviteUserSchema),
  async (req: AuthRequest, res, next) => {
    try {
      await service.inviteTeamMember(
        req.user!.organizationId,
        req.body,
        req.user!.id,
        getFrontendUrl(req)
      );
      res.status(201).json({ success: true, message: 'Invitation sent' });
    } catch (e) { next(e); }
  }
);

/**
 * POST /api/v1/organizations/transfer-ownership
 * Transfer org ownership — ORGANIZATION_OWNER only, requires password confirmation
 */
router.post(
  '/transfer-ownership',
  strictLimiter,
  validateBody(TransferOwnershipSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const userRole = req.user!.orgRole;
      if (userRole !== 'ORGANIZATION_OWNER') {
        res.status(403).json({ success: false, error: { message: 'Only the organization owner can transfer ownership' } });
        return;
      }
      await service.transferOwnership(
        req.user!.id,
        req.user!.organizationId,
        req.body.newOwnerId,
        req.body.confirmPassword,
        getFrontendUrl(req)
      );
      res.json({ success: true, message: 'Ownership transferred successfully' });
    } catch (e) { next(e); }
  }
);

/**
 * DELETE /api/v1/organizations
 * Request org deletion — ORGANIZATION_OWNER only
 * Schedules deletion 30 days out (grace period)
 */
router.delete(
  '/',
  strictLimiter,
  authorize('org:delete'),
  validateBody(RequestDeletionSchema),
  async (req: AuthRequest, res, next) => {
    try {
      await service.requestOrganizationDeletion(
        req.user!.id,
        req.user!.organizationId,
        req.body.reason
      );
      res.json({
        success: true,
        message: 'Organization deletion scheduled. You will receive a confirmation email.',
      });
    } catch (e) { next(e); }
  }
);

// ── Self-service billing ───────────────────────────────────────────────────────

/**
 * POST /api/v1/organizations/billing/checkout
 * Create a Stripe Checkout session to subscribe to a paid plan.
 * ORGANIZATION_OWNER only.
 */
router.post(
  '/billing/checkout',
  strictLimiter,
  authorize('billing:write'),
  validateBody(z.object({
    plan: z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']),
    interval: z.enum(['monthly', 'annual']),
  })),
  async (req: AuthRequest, res, next) => {
    try {
      const { createOrgSubscriptionCheckout } = await import('../platform/billing/platform.billing.service');
      const result = await createOrgSubscriptionCheckout(
        req.user!.organizationId,
        req.body.plan,
        req.body.interval,
        getFrontendUrl(req)
      );
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

/**
 * POST /api/v1/organizations/billing/portal
 * Create a Stripe Billing Portal session for self-service subscription management.
 */
router.post(
  '/billing/portal',
  authorize('billing:read'),
  async (req: AuthRequest, res, next) => {
    try {
      const { createOrgBillingPortal } = await import('../platform/billing/platform.billing.service');
      const result = await createOrgBillingPortal(req.user!.organizationId, getFrontendUrl(req));
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

/**
 * POST /api/v1/organizations/billing/cancel
 * Cancel subscription at period end. ORGANIZATION_OWNER only.
 */
router.post(
  '/billing/cancel',
  strictLimiter,
  authorize('billing:write'),
  validateBody(z.object({ immediate: z.boolean().default(false) })),
  async (req: AuthRequest, res, next) => {
    try {
      if (req.user!.orgRole !== 'ORGANIZATION_OWNER') {
        res.status(403).json({ success: false, error: { message: 'Only the organization owner can cancel the subscription' } });
        return;
      }
      const { cancelOrgSubscription } = await import('../platform/billing/platform.billing.service');
      await cancelOrgSubscription(req.user!.organizationId, req.user!.id, req.body.immediate);
      res.json({ success: true, message: 'Subscription cancellation scheduled' });
    } catch (e) { next(e); }
  }
);

export default router;
