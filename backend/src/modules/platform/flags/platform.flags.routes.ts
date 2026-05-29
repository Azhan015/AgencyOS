/**
 * Platform Feature Flags Routes
 *
 * Allows platform admins to manage per-org feature flags and
 * global default feature flag settings.
 *
 * GET  /api/platform/flags/defaults          — Get global feature flag defaults
 * PATCH /api/platform/flags/defaults         — Update global defaults (PLATFORM_OWNER only)
 * GET  /api/platform/flags/orgs/:orgId       — Get feature flags for a specific org
 * PATCH /api/platform/flags/orgs/:orgId      — Update feature flags for a specific org
 * POST /api/platform/flags/orgs/:orgId/reset — Reset org flags to plan defaults
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticatePlatform } from '../../../middleware/authenticate';
import { authorize } from '../../../middleware/authorize';
import { validateBody } from '../../../middleware/validate';
import { Organization, IOrganization } from '../../../models/Organization';
import { AuditLog } from '../../../models/AuditLog';
import { NotFoundError } from '../../../lib/errors';
import { invalidateOrgCache } from '../../../middleware/tenantScope';
import { env } from '../../../config/env';
import { logger } from '../../../lib/logger';

const router = Router();
router.use(authenticatePlatform);

// ── Feature flag schema ────────────────────────────────────────────────────────

const FeatureFlagsSchema = z.object({
  contractModule:     z.boolean().optional(),
  invoiceModule:      z.boolean().optional(),
  automationsModule:  z.boolean().optional(),
  analyticsModule:    z.boolean().optional(),
  apiAccess:          z.boolean().optional(),
  whiteLabel:         z.boolean().optional(),
  customDomain:       z.boolean().optional(),
  ssoEnabled:         z.boolean().optional(),
});

// ── Global defaults (from env) ─────────────────────────────────────────────────

router.get('/defaults', authorize('feature-flags:read'), (_req, res) => {
  res.json({
    success: true,
    data: {
      contractModule:    true,
      invoiceModule:     true,
      automationsModule: env.NODE_ENV !== 'production' || false,
      analyticsModule:   true,
      apiAccess:         false,
      whiteLabel:        false,
      customDomain:      false,
      ssoEnabled:        false,
    },
  });
});

// ── Get org feature flags ──────────────────────────────────────────────────────

router.get('/orgs/:orgId', authorize('feature-flags:read'), async (req, res, next) => {
  try {
    const org = await Organization.findById(req.params.orgId)
      .select('name slug plan features')
      .lean();
    if (!org) throw new NotFoundError('Organization');
    res.json({ success: true, data: { orgId: req.params.orgId, name: org.name, plan: org.plan, features: org.features } });
  } catch (e) { next(e); }
});

// ── Update org feature flags ───────────────────────────────────────────────────

router.patch(
  '/orgs/:orgId',
  authorize('feature-flags:write'),
  validateBody(FeatureFlagsSchema),
  async (req, res, next) => {
    try {
      const org = await Organization.findById(req.params.orgId);
      if (!org) throw new NotFoundError('Organization');

      const featureUpdate: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(req.body as Record<string, boolean>)) {
        featureUpdate[`features.${key}`] = value;
      }

      const updated = await Organization.findByIdAndUpdate(
        req.params.orgId,
        { $set: featureUpdate },
        { new: true }
      );

      await invalidateOrgCache(req.params.orgId);

      const actorId = (req.user as unknown as Express.PlatformUser).id;
      await AuditLog.create({
        organizationId: req.params.orgId,
        userId: actorId,
        action: 'ORG_FEATURES_UPDATED',
        resource: 'Organization',
        resourceId: req.params.orgId,
        isPlatformAction: true,
        metadata: { features: req.body },
      });

      logger.info({ orgId: req.params.orgId, features: req.body }, 'Feature flags updated');
      res.json({ success: true, data: updated?.features });
    } catch (e) { next(e); }
  }
);

// ── Reset org flags to plan defaults ──────────────────────────────────────────

router.post('/orgs/:orgId/reset', authorize('feature-flags:write'), async (req, res, next) => {
  try {
    const org = await Organization.findById(req.params.orgId);
    if (!org) throw new NotFoundError('Organization');

    // Plan-based feature defaults
    const planDefaults: Record<string, IOrganization['features']> = {
      TRIAL: {
        contractModule: true, invoiceModule: true, automationsModule: false,
        analyticsModule: true, apiAccess: false, whiteLabel: false,
        customDomain: false, ssoEnabled: false,
      },
      STARTER: {
        contractModule: true, invoiceModule: true, automationsModule: false,
        analyticsModule: true, apiAccess: false, whiteLabel: false,
        customDomain: false, ssoEnabled: false,
      },
      GROWTH: {
        contractModule: true, invoiceModule: true, automationsModule: true,
        analyticsModule: true, apiAccess: true, whiteLabel: false,
        customDomain: false, ssoEnabled: false,
      },
      ENTERPRISE: {
        contractModule: true, invoiceModule: true, automationsModule: true,
        analyticsModule: true, apiAccess: true, whiteLabel: true,
        customDomain: true, ssoEnabled: true,
      },
    };

    const defaults = planDefaults[org.plan] ?? planDefaults.TRIAL;
    await Organization.findByIdAndUpdate(req.params.orgId, { features: defaults });
    await invalidateOrgCache(req.params.orgId);

    const actorId = (req.user as unknown as Express.PlatformUser).id;
    await AuditLog.create({
      organizationId: req.params.orgId,
      userId: actorId,
      action: 'ORG_FEATURES_RESET',
      resource: 'Organization',
      resourceId: req.params.orgId,
      isPlatformAction: true,
      metadata: { plan: org.plan, resetTo: defaults },
    });

    res.json({ success: true, data: defaults, message: `Feature flags reset to ${org.plan} plan defaults` });
  } catch (e) { next(e); }
});

export default router;
