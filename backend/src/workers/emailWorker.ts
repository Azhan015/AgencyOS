import { sendEmail } from '../lib/email';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { isRedisAvailable } from '../config/redis';

// Lazy-initialized Bull queue — only created when Redis is available
let emailQueue: import('bull').Queue | null = null;

function getEmailQueue(): import('bull').Queue | null {
  if (!isRedisAvailable()) return null;
  if (!emailQueue) {
    const Bull = require('bull');
    emailQueue = new Bull('email', {
      redis: env.REDIS_URL,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    emailQueue!.process(async (job: import('bull').Job) => {
      const { to, subject, html, text, attachments } = job.data;
      await sendEmail({ to, subject, html, text, attachments });
      logger.info({ to, subject }, 'Email job processed');
    });

    emailQueue!.on('failed', (job: import('bull').Job, err: Error) => {
      logger.error({ jobId: job.id, err }, 'Email job failed');
    });
  }
  return emailQueue;
}

export async function queueEmail(data: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  delay?: number;
}): Promise<void> {
  const queue = getEmailQueue();
  if (queue) {
    await queue.add(data, { delay: data.delay });
  } else {
    // Redis not available — send directly (synchronous fallback)
    try {
      await sendEmail({ to: data.to, subject: data.subject, html: data.html, text: data.text });
    } catch (err) {
      logger.error({ err }, 'Direct email send failed (Redis unavailable)');
    }
  }
}
