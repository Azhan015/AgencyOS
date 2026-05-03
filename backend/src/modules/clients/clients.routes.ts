import { Router } from 'express';
import { z } from 'zod';
import * as controller from './clients.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';

const router = Router();

const createClientSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  tier: z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']).optional(),
  assignedPM: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateClientSchema = createClientSchema.partial();

// Public route — must be BEFORE router.use(authenticate)
router.post(
  '/accept-invite',
  validateBody(z.object({ token: z.string(), password: z.string().min(8).optional() })),
  controller.acceptInvite
);

// All routes below require authentication
router.use(authenticate);

router.get('/', authorize('clients:read'), controller.list);
router.post('/', authorize('clients:write'), validateBody(createClientSchema), controller.create);

// Static sub-paths before /:id to avoid param collision
router.get('/:id', authorize('clients:read'), controller.getOne);
router.patch('/:id', authorize('clients:write'), validateBody(updateClientSchema), controller.update);
router.delete('/:id', authorize('clients:write'), controller.remove);
router.post('/:id/invite', authorize('clients:write'), controller.invite);
router.get('/:id/analytics', authorize('clients:read'), controller.getAnalytics);

export default router;
