import { Router } from 'express';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as service from './analytics.service';

const router = Router();
router.use(authenticate);

router.get('/agency', authorize('analytics:read'), async (_req, res, next) => {
  try {
    const data = await service.getAgencyAnalytics();
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/projects/:id', authorize('analytics:read'), async (req: AuthRequest, res, next) => {
  try {
    const data = await service.getProjectAnalytics(req.params.id);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/clients/:id', authorize('analytics:read'), async (req: AuthRequest, res, next) => {
  try {
    const data = await service.getClientAnalytics(req.params.id);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export default router;
