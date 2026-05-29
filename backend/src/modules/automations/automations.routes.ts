import { Router } from 'express';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorize, requireFeature } from '../../middleware/authorize';
import { tenantScope } from '../../middleware/tenantScope';
import * as service from './automations.service';

const router = Router();
// requireFeature ensures the org has automationsModule enabled (feature flag)
router.use(authenticate, tenantScope, requireFeature('automationsModule'));

router.get('/', authorize('automations:read'), async (req: AuthRequest, res, next) => {
  try {
    const result = await service.listRules({
      ...(req.query as Record<string, string>),
      organizationId: req.user!.organizationId,
    });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

router.post('/', authorize('automations:write'), async (req: AuthRequest, res, next) => {
  try {
    const rule = await service.createRule({
      ...req.body,
      createdBy: req.user!.id,
      organizationId: req.user!.organizationId,
    });
    res.status(201).json({ success: true, data: rule });
  } catch (e) { next(e); }
});

router.get('/:id', authorize('automations:read'), async (req: AuthRequest, res, next) => {
  try {
    const rule = await service.getRule(req.params.id, req.user!.organizationId);
    res.json({ success: true, data: rule });
  } catch (e) { next(e); }
});

router.patch('/:id', authorize('automations:write'), async (req: AuthRequest, res, next) => {
  try {
    const rule = await service.updateRule(req.params.id, req.body, req.user!.organizationId);
    res.json({ success: true, data: rule });
  } catch (e) { next(e); }
});

router.delete('/:id', authorize('automations:write'), async (req: AuthRequest, res, next) => {
  try {
    await service.deleteRule(req.params.id, req.user!.organizationId);
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
