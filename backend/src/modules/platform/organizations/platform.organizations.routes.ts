import { Router } from 'express';
import { z } from 'zod';
import { authenticatePlatform } from '../../../middleware/authenticate';
import { authorize } from '../../../middleware/authorize';
import { validateBody } from '../../../middleware/validate';
import * as service from './platform.organizations.service';
import type { OrgPlan } from '../../../models/Organization';

const router = Router();

// All platform org routes require platform authentication
router.use(authenticatePlatform);

// GET /api/platform/organizations — list all orgs
router.get('/', authorize('orgs:read'), async (req, res, next) => {
  try {
    const { page, limit, status, plan, search } = req.query as Record<string, string>;
    const result = await service.listOrganizations({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status: status as any,
      plan: plan as any,
      search,
    });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

// GET /api/platform/organizations/pending — orgs awaiting approval
router.get('/pending', authorize('orgs:read'), async (_req, res, next) => {
  try {
    const orgs = await service.getPendingOrganizations();
    res.json({ success: true, data: orgs });
  } catch (e) { next(e); }
});

// GET /api/platform/organizations/:id
router.get('/:id', authorize('orgs:read'), async (req, res, next) => {
  try {
    const org = await service.getOrganization(req.params.id);
    res.json({ success: true, data: org });
  } catch (e) { next(e); }
});

// GET /api/platform/organizations/:id/users
router.get('/:id/users', authorize('orgs:read'), async (req, res, next) => {
  try {
    const { page, limit } = req.query as Record<string, string>;
    const result = await service.getOrganizationUsers(req.params.id, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

// GET /api/platform/organizations/:id/audit-logs
router.get('/:id/audit-logs', authorize('orgs:read'), async (req, res, next) => {
  try {
    const { page, limit } = req.query as Record<string, string>;
    const result = await service.getOrganizationAuditLogs(req.params.id, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

// POST /api/platform/organizations/:id/approve
router.post(
  '/:id/approve',
  authorize('orgs:write'),
  validateBody(z.object({ notes: z.string().max(1000).optional() })),
  async (req, res, next) => {
    try {
      const user = req.user as unknown as Express.PlatformUser;
      const org = await service.approveOrganization(req.params.id, user.id, req.body.notes);
      res.json({ success: true, data: org, message: 'Organization approved' });
    } catch (e) { next(e); }
  }
);

// POST /api/platform/organizations/:id/reject
router.post(
  '/:id/reject',
  authorize('orgs:write'),
  validateBody(z.object({ reason: z.string().min(1).max(1000) })),
  async (req, res, next) => {
    try {
      const user = req.user as unknown as Express.PlatformUser;
      const org = await service.rejectOrganization(req.params.id, user.id, req.body.reason);
      res.json({ success: true, data: org, message: 'Organization rejected' });
    } catch (e) { next(e); }
  }
);

// POST /api/platform/organizations/:id/suspend
router.post(
  '/:id/suspend',
  authorize('orgs:write'),
  validateBody(z.object({ reason: z.string().max(500).optional() })),
  async (req, res, next) => {
    try {
      const user = req.user as unknown as Express.PlatformUser;
      const org = await service.suspendOrganization(req.params.id, user.id, req.body.reason);
      res.json({ success: true, data: org, message: 'Organization suspended' });
    } catch (e) { next(e); }
  }
);

// POST /api/platform/organizations/:id/reactivate
router.post('/:id/reactivate', authorize('orgs:write'), async (req, res, next) => {
  try {
    const user = req.user as unknown as Express.PlatformUser;
    const org = await service.reactivateOrganization(req.params.id, user.id);
    res.json({ success: true, data: org, message: 'Organization reactivated' });
  } catch (e) { next(e); }
});

// PATCH /api/platform/organizations/:id/plan
router.patch(
  '/:id/plan',
  authorize('orgs:write'),
  validateBody(z.object({ plan: z.enum(['TRIAL', 'STARTER', 'GROWTH', 'ENTERPRISE']) })),
  async (req, res, next) => {
    try {
      const user = req.user as unknown as Express.PlatformUser;
      const org = await service.updateOrganizationPlan(
        req.params.id,
        req.body.plan as OrgPlan,
        user.id
      );
      res.json({ success: true, data: org });
    } catch (e) { next(e); }
  }
);

// PATCH /api/platform/organizations/:id/features
router.patch(
  '/:id/features',
  authorize('feature-flags:write'),
  validateBody(z.object({
    contractModule: z.boolean().optional(),
    invoiceModule: z.boolean().optional(),
    automationsModule: z.boolean().optional(),
    analyticsModule: z.boolean().optional(),
    apiAccess: z.boolean().optional(),
    whiteLabel: z.boolean().optional(),
    customDomain: z.boolean().optional(),
    ssoEnabled: z.boolean().optional(),
  })),
  async (req, res, next) => {
    try {
      const user = req.user as unknown as Express.PlatformUser;
      const org = await service.updateOrganizationFeatures(req.params.id, req.body, user.id);
      res.json({ success: true, data: org });
    } catch (e) { next(e); }
  }
);

// PATCH /api/platform/organizations/:id/trial
router.patch(
  '/:id/trial',
  authorize('orgs:write'),
  validateBody(z.object({ additionalDays: z.number().int().min(1).max(365) })),
  async (req, res, next) => {
    try {
      const user = req.user as unknown as Express.PlatformUser;
      const org = await service.extendTrial(req.params.id, req.body.additionalDays, user.id);
      res.json({ success: true, data: org, message: `Trial extended by ${req.body.additionalDays} days` });
    } catch (e) { next(e); }
  }
);

export default router;
