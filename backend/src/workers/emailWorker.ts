/**
 * Email Worker — Bull queue for async, template-based email delivery.
 *
 * Features:
 * - Template-based rendering via emailTemplates/index.ts
 * - Scheduled emails (delayed delivery via Bull's delay option)
 * - Org-specific branding (agency name, logo)
 * - Transactional vs marketing classification
 * - Exponential backoff retry (5 attempts)
 * - Graceful fallback when Redis is unavailable (synchronous send)
 */

import { logger } from '../lib/logger';
import { isRedisAvailable } from '../config/redis';
import { getBullRedisOptions } from '../config/bullRedis';
import { sendEmail } from '../lib/email';
import { renderEmailTemplate, EmailTemplateType } from '../lib/emailTemplates/index';
import { defaultBranding, BrandingContext } from '../lib/emailTemplates/base/layout';

// ── Job payload ────────────────────────────────────────────────────────────────

export interface EmailJob {
  type: EmailTemplateType;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  organizationId?: string;
  scheduledFor?: string;   // ISO string — converted to delay ms
  priority?: number;
  tags?: string[];
}

// ── Lazy-initialized Bull queue ────────────────────────────────────────────────

let emailQueue: import('bull').Queue<EmailJob> | null = null;

export function getEmailQueue(): import('bull').Queue<EmailJob> | null {
  if (!isRedisAvailable()) return null;
  if (!emailQueue) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Bull = require('bull');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emailQueue = new Bull('email', {
      redis: getBullRedisOptions(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    }) as import('bull').Queue<EmailJob>;

    emailQueue.process(async (job) => {
      const { type, to, cc, bcc, data, organizationId } = job.data;

      // Load org branding if applicable
      let branding: BrandingContext = { ...defaultBranding };
      if (organizationId) {
        try {
          const { Organization } = await import('../models/Organization');
          const org = await Organization.findById(organizationId)
            .select('name logoUrl')
            .lean();
          if (org) {
            branding = {
              ...defaultBranding,
              agencyName: org.name ?? defaultBranding.agencyName,
              logoUrl: (org.logoUrl as string | undefined) ?? defaultBranding.logoUrl,
            };
          }
        } catch {
          // Non-fatal — fall back to default branding
        }
      }

      const { subject, html, text } = renderEmailTemplate(type, data, branding);

      const toAddresses = Array.isArray(to) ? to.join(', ') : to;
      await sendEmail({ to: toAddresses, subject, html, text });

      logger.info({ type, to: toAddresses, jobId: job.id }, 'Email sent');
    });

    emailQueue.on('failed', (job, err) => {
      logger.error({ jobId: job.id, type: job.data.type, err }, 'Email job failed');
    });

    emailQueue.on('stalled', (job) => {
      logger.warn({ jobId: job.id }, 'Email job stalled');
    });
  }
  return emailQueue;
}

// ── enqueueEmail — primary interface for all modules ──────────────────────────

export async function enqueueEmail(job: EmailJob): Promise<void> {
  const queue = getEmailQueue();

  // Calculate delay for scheduled emails
  const delay = job.scheduledFor
    ? Math.max(0, new Date(job.scheduledFor).getTime() - Date.now())
    : 0;

  if (queue) {
    await queue.add(job, {
      delay,
      priority: job.priority ?? 5,
    });
    return;
  }

  // Redis unavailable — send synchronously (best-effort)
  if (delay > 0) {
    // Cannot schedule without Redis — log and skip
    logger.warn({ type: job.type, scheduledFor: job.scheduledFor }, 'Scheduled email skipped — Redis unavailable');
    return;
  }

  try {
    const branding: BrandingContext = { ...defaultBranding };
    const { subject, html, text } = renderEmailTemplate(job.type, job.data, branding);
    const toAddresses = Array.isArray(job.to) ? job.to.join(', ') : job.to;
    await sendEmail({ to: toAddresses, subject, html, text });
    logger.info({ type: job.type, to: toAddresses }, 'Email sent synchronously (Redis unavailable)');
  } catch (err) {
    logger.error({ err, type: job.type }, 'Synchronous email send failed');
  }
}

// ── Legacy queueEmail — backward compat for existing callers ──────────────────

export async function queueEmail(data: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  delay?: number;
}): Promise<void> {
  const queue = getEmailQueue();
  if (queue) {
    // Use raw job format for legacy callers that build their own HTML
    const Bull = require('bull');
    const rawQueue: import('bull').Queue = new Bull('email-raw', {
      redis: getBullRedisOptions(),
    });
    await rawQueue.add(data, { delay: data.delay });
    return;
  }
  try {
    await sendEmail({ to: data.to, subject: data.subject, html: data.html, text: data.text });
  } catch (err) {
    logger.error({ err }, 'Direct email send failed (Redis unavailable)');
  }
}
