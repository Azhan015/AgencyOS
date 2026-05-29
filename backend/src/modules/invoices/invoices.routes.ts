import { Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantScope } from '../../middleware/tenantScope';
import { validateBody } from '../../middleware/validate';
import * as service from './invoices.service';
import { constructWebhookEvent } from '../../lib/stripe';
import { logger } from '../../lib/logger';

const router = Router();

const createInvoiceSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().optional(),
  milestoneId: z.string().optional(),
  lineItems: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().min(0),
    unitPrice: z.number().min(0),
  })).min(1),
  taxRate: z.number().min(0).max(100).optional(),
  discount: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  dueDate: z.string().datetime(),
  notes: z.string().max(1000).optional(),
});

// Stripe webhook (raw body needed)
router.post('/webhooks/stripe', async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    const event = constructWebhookEvent(req.body as Buffer, sig);
    await service.handleStripeWebhook(event as unknown as { type: string; data: { object: Record<string, unknown> } });
    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, 'Stripe webhook error');
    res.status(400).json({ error: 'Webhook error' });
  }
});

router.use(authenticate, tenantScope);

router.get('/', authorize('invoices:read'), async (req: AuthRequest, res, next) => {
  try {
    const result = await service.listInvoices({
      ...req.query as Record<string, string>,
      clientId: req.user!.role === 'CLIENT' ? req.user!.clientId : (req.query.clientId as string),
      userRole: req.user!.role,
      userId: req.user!.id,
      organizationId: req.user!.organizationId,
    });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

router.post('/', authorize('invoices:write'), validateBody(createInvoiceSchema), async (req: AuthRequest, res, next) => {
  try {
    const invoice = await service.createInvoice({
      ...req.body,
      createdBy: req.user!.id,
      organizationId: req.user!.organizationId,
    });
    res.status(201).json({ success: true, data: invoice });
  } catch (e) { next(e); }
});

router.get('/:id', authorize('invoices:read'), async (req: AuthRequest, res, next) => {
  try {
    const invoice = await service.getInvoice(req.params.id, req.user!.organizationId);
    res.json({ success: true, data: invoice });
  } catch (e) { next(e); }
});

router.patch('/:id', authorize('invoices:write'), async (req: AuthRequest, res, next) => {
  try {
    const invoice = await service.updateInvoice(req.params.id, req.body, req.user!.organizationId);
    res.json({ success: true, data: invoice });
  } catch (e) { next(e); }
});

router.post('/:id/send', authorize('invoices:write'), async (req: AuthRequest, res, next) => {
  try {
    const { getFrontendUrl } = await import('../../lib/frontendUrl');
    const invoice = await service.sendInvoice(req.params.id, getFrontendUrl(req));
    res.json({ success: true, data: invoice });
  } catch (e) { next(e); }
});

router.post('/:id/void', authorize('invoices:write'), async (req: AuthRequest, res, next) => {
  try {
    const invoice = await service.voidInvoice(req.params.id);
    res.json({ success: true, data: invoice });
  } catch (e) { next(e); }
});

router.post('/:id/payment-link', authorize('invoices:read'), async (req: AuthRequest, res, next) => {
  try {
    const { getFrontendUrl } = await import('../../lib/frontendUrl');
    const url = await service.createPaymentLink(req.params.id, getFrontendUrl(req));
    res.json({ success: true, data: { url } });
  } catch (e) { next(e); }
});

export default router;
