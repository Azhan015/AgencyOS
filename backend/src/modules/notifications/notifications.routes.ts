import { Router } from 'express';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import * as service from './notifications.service';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { limit, unread, page } = req.query as Record<string, string>;
    const result = await service.listNotifications(req.user!.id, {
      limit: limit ? Number(limit) : 20,
      unread: unread === 'true',
      page: page ? Number(page) : 1,
    });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

// Static routes MUST come before /:id to avoid param collision
router.post('/read-all', async (req: AuthRequest, res, next) => {
  try {
    await service.markAllRead(req.user!.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.get('/preferences', async (req: AuthRequest, res, next) => {
  try {
    const prefs = await service.getPreferences(req.user!.id);
    res.json({ success: true, data: prefs });
  } catch (e) { next(e); }
});

router.patch('/preferences', async (req: AuthRequest, res, next) => {
  try {
    await service.updatePreferences(req.user!.id, req.body);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Parameterised routes
router.post('/:id/read', async (req: AuthRequest, res, next) => {
  try {
    await service.markRead(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
