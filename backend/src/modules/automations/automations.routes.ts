import { Router } from 'express';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as service from './automations.service';

const router = Router();
router.use(authenticate);

router.get('/', authorize('automations:read'), async (req: AuthRequest, res, next) => {
  try {
    const result = await service.listRules(req.query as Record<string, string>);
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

router.post('/', authorize('automations:write'), async (req: AuthRequest, res, next) => {
  try {
    const rule = await service.createRule({ ...req.body, createdBy: req.user!.id });
    res.status(201).json({ success: true, data: rule });
  } catch (e) { next(e); }
});

router.get('/:id', authorize('automations:read'), async (req: AuthRequest, res, next) => {
  try {
    const rule = await service.getRule(req.params.id);
    res.json({ success: true, data: rule });
  } catch (e) { next(e); }
});

router.patch('/:id', authorize('automations:write'), async (req: AuthRequest, res, next) => {
  try {
    const rule = await service.updateRule(req.params.id, req.body);
    res.json({ success: true, data: rule });
  } catch (e) { next(e); }
});

router.delete('/:id', authorize('automations:write'), async (req: AuthRequest, res, next) => {
  try {
    await service.deleteRule(req.params.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
