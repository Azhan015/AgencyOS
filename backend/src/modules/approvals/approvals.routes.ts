import { Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantScope } from '../../middleware/tenantScope';
import { validateBody } from '../../middleware/validate';
import * as service from './approvals.service';

const router = Router();
router.use(authenticate, tenantScope);

const createApprovalSchema = z.object({
  projectId: z.string().min(1),
  milestoneId: z.string().optional(),
  fileIds: z.array(z.string()).min(1),
  submissionNote: z.string().max(2000).optional(),
  dueDate: z.string().datetime().optional(),
  title: z.string().min(1).max(200),
});

router.get('/', authorize('approvals:read'), async (req: AuthRequest, res, next) => {
  try {
    const result = await service.listApprovals({
      ...(req.query as Record<string, string>),
      organizationId: req.user!.organizationId,
    });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

router.post('/', authorize('approvals:write'), validateBody(createApprovalSchema), async (req: AuthRequest, res, next) => {
  try {
    const approval = await service.createApproval({
      ...req.body,
      submittedBy: req.user!.id,
      organizationId: req.user!.organizationId,
    });
    res.status(201).json({ success: true, data: approval });
  } catch (e) { next(e); }
});

router.get('/:id', authorize('approvals:read'), async (req: AuthRequest, res, next) => {
  try {
    const approval = await service.getApproval(req.params.id, req.user!.organizationId);
    res.json({ success: true, data: approval });
  } catch (e) { next(e); }
});

router.post('/:id/approve', authorize('approvals:write'), async (req: AuthRequest, res, next) => {
  try {
    const approval = await service.approveDeliverable(req.params.id, req.user!.id);
    res.json({ success: true, data: approval });
  } catch (e) { next(e); }
});

router.post('/:id/reject', authorize('approvals:write'), validateBody(z.object({ reason: z.string().min(1) })), async (req: AuthRequest, res, next) => {
  try {
    const approval = await service.rejectDeliverable(req.params.id, req.user!.id, req.body.reason);
    res.json({ success: true, data: approval });
  } catch (e) { next(e); }
});

// Unified review endpoint (approve or reject with optional feedback)
router.post('/:id/review', authorize('approvals:write'), validateBody(z.object({
  action: z.enum(['approve', 'reject', 'request_revision']),
  feedback: z.string().max(2000).optional(),
})), async (req: AuthRequest, res, next) => {
  try {
    const { action, feedback } = req.body;
    let approval;
    if (action === 'approve') {
      approval = await service.approveDeliverable(req.params.id, req.user!.id);
    } else if (action === 'reject') {
      approval = await service.rejectDeliverable(req.params.id, req.user!.id, feedback || 'Rejected');
    } else {
      approval = await service.requestRevision(req.params.id, { note: feedback || 'Revision requested', fileIds: [] });
    }
    res.json({ success: true, data: approval });
  } catch (e) { next(e); }
});

router.post('/:id/request-revision', authorize('approvals:write'), validateBody(z.object({ note: z.string().min(1), fileIds: z.array(z.string()).optional() })), async (req: AuthRequest, res, next) => {
  try {
    const approval = await service.requestRevision(req.params.id, req.body);
    res.json({ success: true, data: approval });
  } catch (e) { next(e); }
});

export default router;
