import { Router } from 'express';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantScope } from '../../middleware/tenantScope';
import * as service from './tasks.service';

const router = Router();
router.use(authenticate, tenantScope);

router.get('/', authorize('tasks:read'), async (req: AuthRequest, res, next) => {
  try {
    const tasks = await service.listTasks({
      ...(req.query as Record<string, string>),
      organizationId: req.user!.organizationId,
    });
    res.json({ success: true, data: tasks });
  } catch (e) { next(e); }
});

router.post('/', authorize('tasks:write'), async (req: AuthRequest, res, next) => {
  try {
    const task = await service.createTask({
      ...req.body,
      createdBy: req.user!.id,
      organizationId: req.user!.organizationId,
    });
    res.status(201).json({ success: true, data: task });
  } catch (e) { next(e); }
});

// Static sub-path BEFORE /:id to avoid param collision
router.post('/reorder', authorize('tasks:write'), async (req: AuthRequest, res, next) => {
  try {
    await service.reorderTasks(req.body.tasks, req.user!.organizationId);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Parameterised routes
router.get('/:id', authorize('tasks:read'), async (req: AuthRequest, res, next) => {
  try {
    const task = await service.getTask(req.params.id, req.user!.organizationId);
    res.json({ success: true, data: task });
  } catch (e) { next(e); }
});

router.patch('/:id', authorize('tasks:write'), async (req: AuthRequest, res, next) => {
  try {
    const task = await service.updateTask(
      req.params.id,
      req.body,
      req.user!.id,
      req.user!.organizationId
    );
    res.json({ success: true, data: task });
  } catch (e) { next(e); }
});

router.delete('/:id', authorize('tasks:write'), async (req: AuthRequest, res, next) => {
  try {
    await service.deleteTask(req.params.id, req.user!.organizationId);
    res.json({ success: true, message: 'Task deleted' });
  } catch (e) { next(e); }
});

export default router;
