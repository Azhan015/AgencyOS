import { Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantScope } from '../../middleware/tenantScope';
import { validateBody } from '../../middleware/validate';
import * as service from './messages.service';

const router = Router();
router.use(authenticate, tenantScope);

const sendMessageSchema = z.object({
  projectId: z.string().min(1),
  channelId: z.string().min(1),
  content: z.string().min(1).max(10000),
  contentType: z.enum(['TEXT', 'FILE', 'SYSTEM']).optional(),
  attachments: z.array(z.string()).optional(),
  mentions: z.array(z.string()).optional(),
  replyTo: z.string().optional(),
});

// ── Static routes MUST come before /:id to avoid param collision ──────────────

router.get('/', authorize('messages:read'), async (req: AuthRequest, res, next) => {
  try {
    const messages = await service.getMessages({
      ...(req.query as Record<string, string>),
      organizationId: req.user!.organizationId,
    });
    res.json({ success: true, data: messages });
  } catch (e) { next(e); }
});

router.post('/', authorize('messages:write'), validateBody(sendMessageSchema), async (req: AuthRequest, res, next) => {
  try {
    const message = await service.sendMessage({
      ...req.body,
      senderId: req.user!.id,
      organizationId: req.user!.organizationId,
    });
    res.status(201).json({ success: true, data: message });
  } catch (e) { next(e); }
});

// /search must be before /:id
router.get('/search', authorize('messages:read'), async (req: AuthRequest, res, next) => {
  try {
    const { q, projectId, limit } = req.query as Record<string, string>;
    const results = await service.searchMessages(
      q,
      projectId,
      limit ? Number(limit) : 20,
      req.user!.organizationId
    );
    res.json({ success: true, data: results });
  } catch (e) { next(e); }
});

// /channels must be before /:id
router.get('/channels', authorize('messages:read'), async (req: AuthRequest, res, next) => {
  try {
    const channels = await service.listChannels(
      req.query.projectId as string | undefined,
      req.user!.organizationId
    );
    res.json({ success: true, data: { channels } });
  } catch (e) { next(e); }
});

// Create a new channel for a project
router.post('/channels', authorize('messages:write'), validateBody(z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, 'Channel name must be lowercase letters, numbers, and hyphens only'),
  type: z.enum(['PROJECT', 'ANNOUNCEMENT']).optional(),
})), async (req: AuthRequest, res, next) => {
  try {
    const { Channel } = await import('../../models/Channel');
    const { projectId, name, type } = req.body;

    const existing = await Channel.findOne({
      projectId,
      name,
      ...(req.user!.organizationId ? { organizationId: req.user!.organizationId } : {}),
    });
    if (existing) {
      res.status(409).json({ success: false, error: { message: `A channel named #${name} already exists in this project` } });
      return;
    }

    const channel = await Channel.create({
      projectId,
      name,
      type: type || 'PROJECT',
      members: [req.user!.id],
      createdBy: req.user!.id,
      ...(req.user!.organizationId ? { organizationId: req.user!.organizationId } : {}),
    });

    const populated = await channel.populate('projectId', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (e) { next(e); }
});

router.get('/channels/:channelId/messages', authorize('messages:read'), async (req: AuthRequest, res, next) => {
  try {
    const { before, limit } = req.query as Record<string, string>;
    const messages = await service.getMessages({
      channelId: req.params.channelId,
      before,
      limit: limit ? Number(limit) : 50,
      organizationId: req.user!.organizationId,
    });
    res.json({ success: true, data: { messages } });
  } catch (e) { next(e); }
});

router.post('/channels/:channelId/messages', authorize('messages:write'), validateBody(z.object({
  content: z.string().min(1).max(10000),
  contentType: z.enum(['TEXT', 'FILE', 'SYSTEM']).optional(),
  attachments: z.array(z.string()).optional(),
  mentions: z.array(z.string()).optional(),
  replyTo: z.string().optional(),
})), async (req: AuthRequest, res, next) => {
  try {
    const { Channel } = await import('../../models/Channel');
    const channelFilter: Record<string, unknown> = { _id: req.params.channelId };
    if (req.user!.organizationId) channelFilter.organizationId = req.user!.organizationId;

    const channel = await Channel.findOne(channelFilter);
    if (!channel) {
      res.status(404).json({ success: false, error: { message: 'Channel not found' } });
      return;
    }
    const message = await service.sendMessage({
      projectId: channel.projectId?.toString() ?? '',
      channelId: req.params.channelId,
      senderId: req.user!.id,
      content: req.body.content,
      contentType: req.body.contentType,
      attachments: req.body.attachments,
      mentions: req.body.mentions,
      replyTo: req.body.replyTo,
      organizationId: req.user!.organizationId,
    });
    res.status(201).json({ success: true, data: message });
  } catch (e) { next(e); }
});

// ── Parameterised routes ───────────────────────────────────────────────────────

router.patch('/:id', authorize('messages:write'), async (req: AuthRequest, res, next) => {
  try {
    const message = await service.editMessage(req.params.id, req.body.content, req.user!.id);
    res.json({ success: true, data: message });
  } catch (e) { next(e); }
});

router.delete('/:id', authorize('messages:write'), async (req: AuthRequest, res, next) => {
  try {
    await service.deleteMessage(
      req.params.id,
      req.user!.id,
      req.user!.orgRole || req.user!.role,
      req.user!.organizationId
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.post('/:id/pin', authorize('messages:write'), async (req: AuthRequest, res, next) => {
  try {
    const message = await service.pinMessage(req.params.id, req.body.pin !== false);
    res.json({ success: true, data: message });
  } catch (e) { next(e); }
});

router.post('/:id/read', authorize('messages:read'), async (req: AuthRequest, res, next) => {
  try {
    await service.markRead(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
