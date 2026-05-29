import { Invoice, IInvoice } from '../../models/Invoice';
import { Client } from '../../models/Client';
import { NotFoundError, ValidationError, PaymentError } from '../../lib/errors';
import { generateInvoicePDF } from '../../lib/pdf';
import { uploadFile, generateStorageKey } from '../../config/storage';
import { sendEmail, getInvoiceEmail } from '../../lib/email';
import { createNotification } from '../notifications/notifications.service';
import { emitAutomationEvent } from '../automations/automations.service';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import mongoose from 'mongoose';

async function getNextInvoiceNumber(organizationId?: string): Promise<string> {
  const year = new Date().getFullYear();
  const filter: Record<string, unknown> = {
    invoiceNumber: { $regex: `^INV-${year}-` },
  };
  if (organizationId) filter.organizationId = organizationId;
  const count = await Invoice.countDocuments(filter);
  const padded = String(count + 1).padStart(4, '0');
  return `INV-${year}-${padded}`;
}

export async function listInvoices(query: {
  clientId?: string;
  projectId?: string;
  status?: string;
  page?: number;
  limit?: number;
  userRole?: string;
  userId?: string;
  organizationId?: string;
}) {
  const { clientId, projectId, status, page = 1, limit = 20, organizationId } = query;

  const filter: Record<string, unknown> = {};
  if (organizationId) filter.organizationId = organizationId;
  if (clientId) filter.clientId = clientId;
  if (projectId) filter.projectId = projectId;
  if (status) filter.status = status;

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate('clientId', 'companyName contactName email')
      .populate('projectId', 'name slug')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(filter),
  ]);

  return { invoices, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getInvoice(id: string, organizationId?: string): Promise<IInvoice> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const invoice = await Invoice.findOne(filter)
    .populate('clientId', 'companyName contactName email stripeCustomerId')
    .populate('projectId', 'name slug')
    .populate('createdBy', 'name email');
  if (!invoice) throw new NotFoundError('Invoice');
  return invoice;
}

export async function createInvoice(data: {
  clientId: string;
  projectId?: string;
  milestoneId?: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
  taxRate?: number;
  discount?: number;
  currency?: string;
  dueDate: Date;
  notes?: string;
  createdBy: string;
  organizationId?: string;
}): Promise<IInvoice> {
  const invoiceNumber = await getNextInvoiceNumber(data.organizationId);

  const lineItems = data.lineItems.map(item => ({
    ...item,
    amount: item.quantity * item.unitPrice,
  }));

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const discount = data.discount || 0;
  const taxRate = data.taxRate || 0;
  const tax = ((subtotal - discount) * taxRate) / 100;
  const total = subtotal - discount + tax;

  const invoice = await Invoice.create({
    invoiceNumber,
    ...data,
    lineItems,
    subtotal,
    tax,
    taxRate,
    discount,
    total,
    currency: data.currency || 'USD',
    status: 'DRAFT',
  });

  return invoice;
}

export async function updateInvoice(id: string, data: Partial<IInvoice>, organizationId?: string): Promise<IInvoice> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const invoice = await Invoice.findOne(filter);
  if (!invoice) throw new NotFoundError('Invoice');

  if (['SENT', 'PAID', 'VOID'].includes(invoice.status)) {
    throw new ValidationError('Cannot edit a sent, paid, or voided invoice');
  }

  // Recalculate totals if line items changed
  if (data.lineItems) {
    const lineItems = data.lineItems.map(item => ({
      ...item,
      amount: item.quantity * item.unitPrice,
    }));
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const discount = data.discount ?? invoice.discount;
    const taxRate = data.taxRate ?? invoice.taxRate;
    const tax = ((subtotal - discount) * taxRate) / 100;
    data.lineItems = lineItems;
    (data as Record<string, unknown>).subtotal = subtotal;
    (data as Record<string, unknown>).tax = tax;
    (data as Record<string, unknown>).total = subtotal - discount + tax;
  }

  const updated = await Invoice.findOneAndUpdate(filter, { $set: data }, { new: true });
  if (!updated) throw new NotFoundError('Invoice');
  return updated;
}

export async function sendInvoice(id: string, frontendUrl?: string): Promise<IInvoice> {
  const invoice = await Invoice.findById(id).populate('clientId');
  if (!invoice) throw new NotFoundError('Invoice');

  if (invoice.status !== 'DRAFT') {
    throw new ValidationError('Only draft invoices can be sent');
  }

  // Generate PDF
  try {
    const client = invoice.clientId as unknown as { companyName: string; email: string; contactName: string };
    const pdfBuffer = await generateInvoicePDF({
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: new Date(),
      dueDate: invoice.dueDate,
      clientName: client.companyName,
      clientEmail: client.email,
      agencyName: env.AGENCY_NAME,
      agencyEmail: env.AGENCY_EMAIL,
      lineItems: invoice.lineItems,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      taxRate: invoice.taxRate,
      discount: invoice.discount,
      total: invoice.total,
      currency: invoice.currency,
      notes: invoice.notes,
      status: 'SENT',
    });

    const pdfKey = generateStorageKey('invoices', `${invoice.invoiceNumber}.pdf`);
    await uploadFile(pdfKey, pdfBuffer, 'application/pdf');

    await Invoice.findByIdAndUpdate(id, { pdfKey });
  } catch (err) {
    logger.warn({ err }, 'PDF generation failed, continuing without PDF');
  }

  const updated = await Invoice.findByIdAndUpdate(
    id,
    { status: 'SENT', issuedAt: new Date() },
    { new: true }
  ).populate('clientId');

  if (!updated) throw new NotFoundError('Invoice');

  // Send email
  try {
    const client = updated.clientId as unknown as { email: string; contactName: string };
    const payLink = `${frontendUrl || env.FRONTEND_URL}/invoices/${id}/pay`;
    await sendEmail({
      to: client.email,
      subject: `Invoice ${updated.invoiceNumber} from ${env.AGENCY_NAME}`,
      html: getInvoiceEmail(
        client.contactName,
        updated.invoiceNumber,
        `${updated.currency} ${updated.total.toFixed(2)}`,
        updated.dueDate.toLocaleDateString(),
        payLink
      ),
    });
  } catch (err) {
    logger.warn({ err }, 'Invoice email failed');
  }

  // Notify client
  const client = updated.clientId as unknown as { _id: string };
  const { User } = await import('../../models/User');
  const clientUser = await User.findOne({ clientId: client._id, role: 'CLIENT' });
  if (clientUser) {
    await createNotification({
      userId: clientUser._id.toString(),
      type: 'INVOICE_DUE',
      title: `Invoice ${updated.invoiceNumber}`,
      body: `You have a new invoice for ${updated.currency} ${updated.total.toFixed(2)}`,
      link: `/invoices/${id}`,
      metadata: { invoiceId: id },
    });
  }

  return updated;
}

export async function voidInvoice(id: string): Promise<IInvoice> {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw new NotFoundError('Invoice');

  if (invoice.status === 'PAID') {
    throw new ValidationError('Cannot void a paid invoice');
  }

  const updated = await Invoice.findByIdAndUpdate(id, { status: 'VOID' }, { new: true });
  return updated!;
}

export async function createPaymentLink(id: string, frontendUrl?: string): Promise<string> {
  const invoice = await Invoice.findById(id).populate('clientId');
  if (!invoice) throw new NotFoundError('Invoice');

  if (!['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'].includes(invoice.status)) {
    throw new ValidationError('Invoice is not payable');
  }

  try {
    const { createCheckoutSession } = await import('../../lib/stripe');
    const client = invoice.clientId as unknown as { stripeCustomerId?: string; email: string; companyName: string };

    let customerId = client.stripeCustomerId;
    if (!customerId) {
      const { createStripeCustomer } = await import('../../lib/stripe');
      customerId = await createStripeCustomer(client.email, client.companyName);
      await Client.findByIdAndUpdate(invoice.clientId, { stripeCustomerId: customerId });
    }

    const session = await createCheckoutSession(
      customerId,
      invoice.lineItems.map(item => ({
        name: item.description,
        amount: item.amount,
        currency: invoice.currency,
        quantity: 1,
      })),
      `${frontendUrl || env.FRONTEND_URL}/invoices/${id}?payment=success`,
      `${frontendUrl || env.FRONTEND_URL}/invoices/${id}?payment=cancelled`,
      { invoiceId: id, invoiceNumber: invoice.invoiceNumber }
    );

    await Invoice.findByIdAndUpdate(id, { checkoutSessionId: session.id });
    return session.url!;
  } catch (err) {
    logger.error({ err }, 'Stripe checkout session creation failed');
    throw new PaymentError('Failed to create payment link');
  }
}

export async function handleStripeWebhook(event: { type: string; data: { object: Record<string, unknown> } }): Promise<void> {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const invoiceId = (session.metadata as Record<string, string>)?.invoiceId;

    if (invoiceId) {
      const invoice = await Invoice.findByIdAndUpdate(
        invoiceId,
        {
          status: 'PAID',
          paidAt: new Date(),
          paymentGateway: 'STRIPE',
          paymentIntentId: session.payment_intent as string,
        },
        { new: true }
      );

      if (invoice) {
        await emitAutomationEvent('invoice.paid', {
          invoiceId,
          projectId: invoice.projectId?.toString(),
          clientId: invoice.clientId.toString(),
          amount: invoice.total,
        });

        // Notify PM
        const { Project } = await import('../../models/Project');
        if (invoice.projectId) {
          const project = await Project.findById(invoice.projectId);
          if (project) {
            await createNotification({
              userId: project.pm.toString(),
              type: 'INVOICE_PAID',
              title: 'Invoice paid',
              body: `Invoice ${invoice.invoiceNumber} has been paid`,
              link: `/invoices/${invoiceId}`,
              metadata: { invoiceId },
            });
          }
        }
      }
    }
  }
}

export async function markOverdueInvoices(): Promise<void> {
  const now = new Date();
  await Invoice.updateMany(
    { status: { $in: ['SENT', 'VIEWED', 'PARTIAL'] }, dueDate: { $lt: now } },
    { status: 'OVERDUE' }
  );
}
