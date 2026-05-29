import { Router } from 'express';
import { z } from 'zod';
import { authenticatePlatform } from '../../../middleware/authenticate';
import { validateBody } from '../../../middleware/validate';
import * as service from './platform.impersonation.service';
import type { PlatformRole } from '../../../middleware/authorize';

const router = Router();
router.use(authenticatePlatform);

// POST /api/platform/impersonation/start
router.post(
  '/start',
  validateBody(z.object({ organizationId: z.string().min(1) })),
  async (req, res, next) => {
    try {
      const platformUser = req.user as unknown as Express.PlatformUser;
      const result = await service.startImpersonation(
        platformUser.id,
        platformUser.platformRole as PlatformRole,
        req.body.organizationId
      );
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

// POST /api/platform/impersonation/stop
router.post('/stop', async (req, res, next) => {
  try {
    const platformUser = req.user as unknown as Express.PlatformUser;
    if (!platformUser.impersonating) {
      res.status(400).json({ success: false, error: { message: 'No active impersonation session' } });
      return;
    }
    await service.stopImpersonation(platformUser.sessionId, platformUser.id);
    res.json({ success: true, message: 'Impersonation ended' });
  } catch (e) { next(e); }
});

// GET /api/platform/impersonation/active
router.get('/active', async (req, res, next) => {
  try {
    const platformUser = req.user as unknown as Express.PlatformUser;
    if (!platformUser.impersonating) {
      res.json({ success: true, data: null });
      return;
    }
    const session = await service.getActiveImpersonation(platformUser.sessionId);
    res.json({ success: true, data: session });
  } catch (e) { next(e); }
});

export default router;
