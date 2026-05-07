import { Invoice } from '../models/Invoice';
import { generateInvoicePDF } from '../lib/pdf';
import { uploadFile, generateStorageKey } from '../config/storage';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { isRedisAvailable } from '../config/redis';
import { getBullRedisOptions } from '../config/bullRedis';

// Lazy-initialized Bull queue — only created when Redis is available
let invoiceQueue: import('bull').Queue | null = null;

function getInvoiceQueue(): import('bull').Queue | null {
  if (!isRedisAvailable()) return null;
  if (!invoiceQueue) {
    const Bull = require('bull');
    invoiceQueue = new Bull('invoice', {
      redis: getBullRedisOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    });

    invoiceQueue!.process('generate-pdf', async (job: import('bull').Job) => {
      const { invoiceId } = job.data;
      const invoice = await Invoice.findById(invoiceId).populate('clientId');
      if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

      const client = invoice.clientId as unknown as { companyName: string; email: string; contactName: string };

      const pdfBuffer = await generateInvoicePDF({
        invoiceNumber: invoice.invoiceNumber,
        issuedAt: invoice.issuedAt || new Date(),
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
        status: invoice.status,
      });

      const pdfKey = generateStorageKey('invoices', `${invoice.invoiceNumber}.pdf`);
      await uploadFile(pdfKey, pdfBuffer, 'application/pdf');
      await Invoice.findByIdAndUpdate(invoiceId, { pdfKey });

      logger.info({ invoiceId, pdfKey }, 'Invoice PDF generated');
      return { pdfKey };
    });

    invoiceQueue!.on('failed', (job: import('bull').Job, err: Error) => {
      logger.error({ jobId: job.id, jobName: job.name, err }, 'Invoice job failed');
    });
  }
  return invoiceQueue;
}

export { getInvoiceQueue };
