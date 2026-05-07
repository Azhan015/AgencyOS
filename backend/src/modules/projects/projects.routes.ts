import { Router } from 'express';
import { z } from 'zod';
import * as controller from './projects.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';

const router = Router();

const dateOrDatetime = z
  .string()
  .optional()
  .refine(
    (v) => !v || !isNaN(Date.parse(v)),
    { message: 'Invalid date' }
  )
  .transform((v) => (v ? new Date(v) : undefined));

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  clientId: z.string().min(1),
  type: z.enum(['WEBSITE', 'BRANDING', 'CAMPAIGN', 'CUSTOM']).optional(),
  pm: z.string().optional(),
  contributors: z.array(z.string()).optional(),
  budget: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  startDate: dateOrDatetime,
  endDate: dateOrDatetime,
  description: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
  milestones: z.array(z.object({
    name: z.string().min(1),
    dueDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' }).transform((v) => new Date(v)),
    invoiceAmount: z.number().min(0).optional(),
    triggerInvoice: z.boolean().optional(),
    order: z.number().optional(),
  })).optional(),
});

const milestoneSchema = z.object({
  name: z.string().min(1),
  dueDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' }).transform((v) => new Date(v)),
  invoiceAmount: z.number().min(0).optional(),
  triggerInvoice: z.boolean().optional(),
  order: z.number().optional(),
});

router.use(authenticate);

router.get('/', authorize('projects:read'), controller.list);
router.post('/', authorize('projects:write'), validateBody(createProjectSchema), controller.create);
router.get('/:id', authorize('projects:read'), controller.getOne);
router.patch('/:id', authorize('projects:write'), controller.update);
router.patch('/:id/status', authorize('projects:write'), validateBody(z.object({ status: z.enum(['SCOPING', 'ACTIVE', 'REVIEW', 'COMPLETED', 'ARCHIVED']) })), controller.updateStatus);
router.post('/:id/milestones', authorize('projects:write'), validateBody(milestoneSchema), controller.addMilestone);
router.patch('/:id/milestones/:mid', authorize('projects:write'), controller.updateMilestone);
router.get('/:id/activity', authorize('projects:read'), controller.getActivity);

export default router;
