import { Router } from 'express';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as service from './tasks.service';

const router = Router();
router.use(authenticate);

router.get('/', authorize('projects:read'), async (req: AuthRequest, res, next) => {
  try {
    const tasks = await service.listTasks(req.query as Record<string, string>);
    res.json({ success: true, data: tasks });
  } catch (e) { next(e); }
});

router.post('/', authorize('projects:write'), async (req: AuthRequest, res, next) => {
  try {
    const task = await service.createTask({ ...req.body, createdBy: req.user!.id });
    res.status(201).json({ success: true, data: task });
  } catch (e) { next(e); }
});

// Static sub-path BEFORE /:id to avoid param collision
router.post('/reorder', authorize('projects:write'), async (req: AuthRequest, res, next) => {
  try {
    await service.reorderTasks(req.body.tasks);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Parameterised routes
router.get('/:id', authorize('projects:read'), async (req: AuthRequest, res, next) => {
  try {
    const task = await service.getTask(req.params.id);
    res.json({ success: true, data: task });
  } catch (e) { next(e); }
});

router.patch('/:id', authorize('projects:write'), async (req: AuthRequest, res, next) => {
  try {
    const task = await service.updateTask(req.params.id, req.body);
    res.json({ success: true, data: task });
  } catch (e) { next(e); }
});

router.delete('/:id', authorize('projects:write'), async (req: AuthRequest, res, next) => {
  try {
    await service.deleteTask(req.params.id);
    res.json({ success: true, message: 'Task deleted' });
  } catch (e) { next(e); }
});

export default router;
