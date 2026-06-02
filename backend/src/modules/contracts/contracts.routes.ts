import { Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorize, requireFeature } from '../../middleware/authorize';
import { tenantScope } from '../../middleware/tenantScope';
import { validateBody } from '../../middleware/validate';
import * as service from './contracts.service';

const router = Router();
// requireFeature ensures the org has contractModule enabled (feature flag)
router.use(authenticate, tenantScope, requireFeature('contractModule'));

const createContractSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().optional(),
  templateId: z.string().optional(),
  type: z.enum(['NDA', 'SOW', 'RETAINER', 'CHANGE_ORDER']),
  title: z.string().min(1).max(200),
  content: z.string().optional(),
  variables: z.record(z.unknown()).optional(),
  expiresAt: z.string().datetime().optional(),
});

const signSchema = z.object({
  svg: z.string().min(1),
  signerName: z.string().min(1),
  isAgency: z.boolean().optional(),
});

router.get('/', authorize('contracts:read'), async (req: AuthRequest, res, next) => {
  try {
    const result = await service.listContracts({
      ...req.query as Record<string, string>,
      clientId: req.user!.role === 'CLIENT' ? req.user!.clientId : (req.query.clientId as string),
      organizationId: req.user!.organizationId,
    });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

router.post('/', authorize('contracts:write'), validateBody(createContractSchema), async (req: AuthRequest, res, next) => {
  try {
    const contract = await service.createContract({
      ...req.body,
      createdBy: req.user!.id,
      organizationId: req.user!.organizationId,
    });
    res.status(201).json({ success: true, data: contract });
  } catch (e) { next(e); }
});

// Static sub-paths BEFORE /:id to avoid param collision
router.get('/templates', authorize('contracts:read'), async (req: AuthRequest, _res, next) => {
  try {
    const templates = await service.listTemplates(req.user!.organizationId);
    _res.json({ success: true, data: templates });
  } catch (e) { next(e); }
});

router.post('/templates', authorize('contracts:write'), async (req: AuthRequest, res, next) => {
  try {
    const template = await service.createTemplate({
      ...req.body,
      createdBy: req.user!.id,
      organizationId: req.user!.organizationId,
    });
    res.status(201).json({ success: true, data: template });
  } catch (e) { next(e); }
});

// Parameterised routes
router.get('/:id', authorize('contracts:read'), async (req: AuthRequest, res, next) => {
  try {
    const contract = await service.getContract(req.params.id, req.user!.organizationId);
    res.json({ success: true, data: contract });
  } catch (e) { next(e); }
});

router.patch('/:id', authorize('contracts:write'), async (req: AuthRequest, res, next) => {
  try {
    const contract = await service.updateContract(req.params.id, req.body, req.user!.organizationId);
    res.json({ success: true, data: contract });
  } catch (e) { next(e); }
});

router.post('/:id/send', authorize('contracts:write'), async (req: AuthRequest, res, next) => {
  try {
    const { getFrontendUrl } = await import('../../lib/frontendUrl');
    const contract = await service.sendContract(req.params.id, getFrontendUrl(req));
    res.json({ success: true, data: contract });
  } catch (e) { next(e); }
});

router.post('/:id/sign', authorize('contracts:read'), validateBody(signSchema), async (req: AuthRequest, res, next) => {
  try {
    const contract = await service.signContract(req.params.id, {
      ...req.body,
      ipAddress: req.ip || '0.0.0.0',
      userAgent: req.headers['user-agent'] || 'unknown',
    });
    res.json({ success: true, data: contract });
  } catch (e) { next(e); }
});

export default router;
