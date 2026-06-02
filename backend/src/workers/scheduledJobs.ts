import cron from 'node-cron';
import { Invoice } from '../models/Invoice';
import { Project } from '../models/Project';
import { computeHealthScore } from '../modules/projects/projects.service';
import { sendEmail, getInvoiceEmail } from '../lib/email';
import { env } from '../config/env';
import { logger } from '../lib/logger';

export function startScheduledJobs(): void {

  // ── Mark overdue invoices — every hour ────────────────────────────────────
  // Runs across all orgs (no org filter needed — status update is safe globally)
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

  // ── Invoice reminders — daily at 9am ──────────────────────────────────────
  cron.schedule('0 9 * * *', async () => {
    try {
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      const upcomingInvoices = await Invoice.find({
        status: { $in: ['SENT', 'VIEWED'] },
        dueDate: {
          $gte: threeDaysFromNow,
          $lt: new Date(threeDaysFromNow.getTime() + 24 * 60 * 60 * 1000),
        },
      }).populate('clientId');

      for (const invoice of upcomingInvoices) {
        try {
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
        } catch (err) {
          logger.warn({ err, invoiceId: invoice._id }, 'Failed to send invoice reminder');
        }
      }

      logger.info({ count: upcomingInvoices.length }, 'Invoice reminders sent');
    } catch (err) {
      logger.error({ err }, 'Invoice reminder job failed');
    }
  });

  // ── Project health scores — every 6 hours ─────────────────────────────────
  // Passes organizationId to computeHealthScore for proper org-scoped task queries
  cron.schedule('0 */6 * * *', async () => {
    try {
      const activeProjects = await Project.find({ status: 'ACTIVE' })
        .select('_id organizationId')
        .lean();

      let updated = 0;
      for (const project of activeProjects) {
        try {
          await computeHealthScore(
            project._id.toString(),
            project.organizationId?.toString()
          );
          updated++;
        } catch (err) {
          logger.warn({ err, projectId: project._id }, 'Health score update failed for project');
        }
      }
      logger.info({ count: updated }, 'Project health scores updated');
    } catch (err) {
      logger.error({ err }, 'Health score job failed');
    }
  });

  // ── Platform analytics cache refresh — every 15 minutes ──────────────────
  // Pre-warms the platform analytics cache so dashboard loads are instant.
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { refreshAnalyticsCache } = await import('../modules/platform/analytics/platform.analytics.service');
      await refreshAnalyticsCache();
    } catch (err) {
      logger.error({ err }, 'Platform analytics cache refresh job failed');
    }
  });

  // ── Storage usage reconciliation — daily at 02:00 UTC ─────────────────────  // Recomputes actual storage usage from File records and syncs to Organization.
  // Corrects any drift caused by failed delete operations or missed increments.
  cron.schedule('0 2 * * *', async () => {
    try {
      const { Organization } = await import('../models/Organization');
      const { File } = await import('../models/File');

      // Get all active orgs
      const orgs = await Organization.find({
        status: { $in: ['ACTIVE', 'APPROVED'] },
      }).select('_id').lean();

      let reconciled = 0;
      let drifted = 0;

      for (const org of orgs) {
        try {
          // Sum actual file sizes for this org
          const result = await File.aggregate([
            { $match: { organizationId: org._id, scanStatus: { $ne: 'INFECTED' } } },
            { $group: { _id: null, totalBytes: { $sum: '$sizeBytes' } } },
          ]);

          const actualBytes = result[0]?.totalBytes ?? 0;

          // Fetch current recorded usage
          const orgDoc = await Organization.findById(org._id)
            .select('usage.storageUsedBytes')
            .lean();

          const recordedBytes = orgDoc?.usage?.storageUsedBytes ?? 0;

          // Only update if there's meaningful drift (>1MB difference)
          if (Math.abs(actualBytes - recordedBytes) > 1024 * 1024) {
            await Organization.findByIdAndUpdate(org._id, {
              'usage.storageUsedBytes': actualBytes,
            });
            drifted++;
            logger.info(
              { orgId: org._id, recorded: recordedBytes, actual: actualBytes },
              'Storage usage reconciled'
            );
          }

          reconciled++;
        } catch (err) {
          logger.warn({ err, orgId: org._id }, 'Storage reconciliation failed for org');
        }
      }

      logger.info(
        { total: reconciled, drifted },
        'Storage reconciliation job completed'
      );
    } catch (err) {
      logger.error({ err }, 'Storage reconciliation job failed');
    }
  });

  logger.info('✅ Scheduled jobs started');
}
