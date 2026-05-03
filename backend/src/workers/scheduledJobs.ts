import cron from 'node-cron';
import { Invoice } from '../models/Invoice';
import { Project } from '../models/Project';
import { computeHealthScore } from '../modules/projects/projects.service';
import { createNotification } from '../modules/notifications/notifications.service';
import { sendEmail, getInvoiceEmail } from '../lib/email';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { User } from '../models/User';

export function startScheduledJobs(): void {
  // Check overdue invoices every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();
      const updated = await Invoice.updateMany(
        { status: { $in: ['SENT', 'VIEWED', 'PARTIAL'] }, dueDate: { $lt: now } },
        { status: 'OVERDUE' }
      );
      if (updated.modifiedCount > 0) {
        logger.info({ count: updated.modifiedCount }, 'Marked invoices as overdue');
      }
    } catch (err) {
      logger.error({ err }, 'Overdue invoice job failed');
    }
  });

  // Send invoice reminders daily at 9am
  cron.schedule('0 9 * * *', async () => {
    try {
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

      // D-3 reminders
      const upcomingInvoices = await Invoice.find({
        status: { $in: ['SENT', 'VIEWED'] },
        dueDate: { $gte: threeDaysFromNow, $lt: new Date(threeDaysFromNow.getTime() + 24 * 60 * 60 * 1000) },
      }).populate('clientId');

      for (const invoice of upcomingInvoices) {
        const client = invoice.clientId as unknown as { email: string; contactName: string };
        const payLink = `${env.FRONTEND_URL}/invoices/${invoice._id}/pay`;
        await sendEmail({
          to: client.email,
          subject: `Reminder: Invoice ${invoice.invoiceNumber} due in 3 days`,
          html: getInvoiceEmail(
            client.contactName,
            invoice.invoiceNumber,
            `${invoice.currency} ${invoice.total.toFixed(2)}`,
            invoice.dueDate.toLocaleDateString(),
            payLink
          ),
        });
        await Invoice.findByIdAndUpdate(invoice._id, {
          $push: { remindersSent: new Date() },
        });
      }

      logger.info({ count: upcomingInvoices.length }, 'Invoice reminders sent');
    } catch (err) {
      logger.error({ err }, 'Invoice reminder job failed');
    }
  });

  // Update project health scores every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    try {
      const activeProjects = await Project.find({ status: 'ACTIVE' }).select('_id');
      for (const project of activeProjects) {
        await computeHealthScore(project._id.toString());
      }
      logger.info({ count: activeProjects.length }, 'Project health scores updated');
    } catch (err) {
      logger.error({ err }, 'Health score job failed');
    }
  });

  logger.info('✅ Scheduled jobs started');
}
