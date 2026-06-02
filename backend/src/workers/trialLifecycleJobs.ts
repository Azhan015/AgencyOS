/**
 * Trial & Subscription Lifecycle Cron Jobs
 *
 * JOB 1 — Trial expiry enforcement       (every hour :00)
 * JOB 2 — Trial reminder T-7 days        (daily 09:00 UTC)
 * JOB 3 — Trial reminder T-3 days        (daily 09:15 UTC)
 * JOB 4 — Trial reminder T-1 day         (daily 09:30 UTC)
 * JOB 5 — Subscription expiry + grace    (every hour :30)
 */

import cron from 'node-cron';
import { Organization } from '../models/Organization';
import { enqueueEmail } from './emailWorker';
import { invalidateCache, CacheGroups, invalidateOrgSessions } from '../lib/cacheInvalidation';
import { env } from '../config/env';
import { logger } from '../lib/logger';

const UPGRADE_URL = `${env.FRONTEND_URL}/billing/upgrade`;
const BILLING_URL = `${env.FRONTEND_URL}/billing`;

// ── JOB 1: Trial expiry enforcement ───────────────────────────────────────────

function startTrialExpiryJob(): void {
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();
      const expired = await Organization.find({
        status: 'ACTIVE',
        plan: 'TRIAL',
        trialEndsAt: { $lt: now },
      }).lean();

      for (const org of expired) {
        await Organization.updateOne({ _id: org._id }, { status: 'EXPIRED_TRIAL' });
        await invalidateCache(CacheGroups.orgMeta(org._id.toString()));

        await enqueueEmail({
          type: 'org:trial-expired',
          to: org.ownerEmail,
          organizationId: org._id.toString(),
          data: {
            ownerName: org.ownerEmail,
            orgName: org.name,
            upgradeUrl: UPGRADE_URL,
          },
        });

        logger.info({ orgId: org._id, orgName: org.name }, 'Trial expired — org status set to EXPIRED_TRIAL');
      }

      if (expired.length > 0) {
        logger.info({ count: expired.length }, 'Trial expiry job completed');
      }
    } catch (err) {
      logger.error({ err }, 'Trial expiry job failed');
    }
  }, { timezone: 'UTC' });
}

// ── JOB 2: Trial reminder T-7 days ────────────────────────────────────────────

function startTrialReminder7DayJob(): void {
  cron.schedule('0 9 * * *', async () => {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
      const windowEnd   = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const orgs = await Organization.find({
        status: 'ACTIVE',
        plan: 'TRIAL',
        trialEndsAt: { $gte: windowStart, $lte: windowEnd },
      }).lean();

      for (const org of orgs) {
        await enqueueEmail({
          type: 'org:trial-expiring-7-days',
          to: org.ownerEmail,
          organizationId: org._id.toString(),
          data: {
            ownerName: org.ownerEmail,
            orgName: org.name,
            daysLeft: 7,
            trialEndsAt: org.trialEndsAt,
            upgradeUrl: UPGRADE_URL,
          },
        });
      }

      if (orgs.length > 0) {
        logger.info({ count: orgs.length }, 'Trial 7-day reminders sent');
      }
    } catch (err) {
      logger.error({ err }, 'Trial 7-day reminder job failed');
    }
  }, { timezone: 'UTC' });
}

// ── JOB 3: Trial reminder T-3 days ────────────────────────────────────────────

function startTrialReminder3DayJob(): void {
  cron.schedule('15 9 * * *', async () => {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      const windowEnd   = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      const orgs = await Organization.find({
        status: 'ACTIVE',
        plan: 'TRIAL',
        trialEndsAt: { $gte: windowStart, $lte: windowEnd },
      }).lean();

      for (const org of orgs) {
        await enqueueEmail({
          type: 'org:trial-expiring-3-days',
          to: org.ownerEmail,
          organizationId: org._id.toString(),
          data: {
            ownerName: org.ownerEmail,
            orgName: org.name,
            daysLeft: 3,
            trialEndsAt: org.trialEndsAt,
            upgradeUrl: UPGRADE_URL,
          },
        });
      }

      if (orgs.length > 0) {
        logger.info({ count: orgs.length }, 'Trial 3-day reminders sent');
      }
    } catch (err) {
      logger.error({ err }, 'Trial 3-day reminder job failed');
    }
  }, { timezone: 'UTC' });
}

// ── JOB 4: Trial reminder T-1 day ─────────────────────────────────────────────

function startTrialReminder1DayJob(): void {
  cron.schedule('30 9 * * *', async () => {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() + 0.5 * 24 * 60 * 60 * 1000);
      const windowEnd   = new Date(now.getTime() + 1.5 * 24 * 60 * 60 * 1000);

      const orgs = await Organization.find({
        status: 'ACTIVE',
        plan: 'TRIAL',
        trialEndsAt: { $gte: windowStart, $lte: windowEnd },
      }).lean();

      for (const org of orgs) {
        await enqueueEmail({
          type: 'org:trial-expiring-1-day',
          to: org.ownerEmail,
          organizationId: org._id.toString(),
          data: {
            ownerName: org.ownerEmail,
            orgName: org.name,
            daysLeft: 1,
            trialEndsAt: org.trialEndsAt,
            upgradeUrl: UPGRADE_URL,
          },
        });
      }

      if (orgs.length > 0) {
        logger.info({ count: orgs.length }, 'Trial 1-day reminders sent');
      }
    } catch (err) {
      logger.error({ err }, 'Trial 1-day reminder job failed');
    }
  }, { timezone: 'UTC' });
}

// ── JOB 5: Subscription expiry + grace period ─────────────────────────────────

function startSubscriptionExpiryJob(): void {
  cron.schedule('30 * * * *', async () => {
    try {
      const now = new Date();

      // Find paid orgs whose subscription has expired
      const expired = await Organization.find({
        status: 'ACTIVE',
        plan: { $ne: 'TRIAL' },
        expiresAt: { $lt: now },
      }).lean();

      for (const org of expired) {
        if (!org.expiresAt) continue;

        const gracePeriodEnd = new Date(org.expiresAt.getTime() + 7 * 24 * 60 * 60 * 1000);

        if (now < gracePeriodEnd) {
          // Still in grace period — send reminder only
          await enqueueEmail({
            type: 'org:payment-overdue-grace',
            to: org.ownerEmail,
            organizationId: org._id.toString(),
            data: {
              ownerName: org.ownerEmail,
              orgName: org.name,
              gracePeriodEnd,
              updateBillingUrl: BILLING_URL,
            },
          });
        } else {
          // Grace period over — suspend
          await Organization.updateOne(
            { _id: org._id },
            { status: 'SUSPENDED', suspendedAt: now }
          );
          await invalidateCache(CacheGroups.orgMeta(org._id.toString()));
          await invalidateOrgSessions(org._id.toString());

          await enqueueEmail({
            type: 'org:suspended',
            to: org.ownerEmail,
            organizationId: org._id.toString(),
            data: {
              ownerName: org.ownerEmail,
              orgName: org.name,
              reason: 'Subscription payment overdue',
              supportUrl: `${env.FRONTEND_URL}/support`,
            },
          });

          logger.info({ orgId: org._id, orgName: org.name }, 'Org suspended — subscription expired past grace period');
        }
      }

      if (expired.length > 0) {
        logger.info({ count: expired.length }, 'Subscription expiry job completed');
      }
    } catch (err) {
      logger.error({ err }, 'Subscription expiry job failed');
    }
  }, { timezone: 'UTC' });
}

// ── Public entry point ─────────────────────────────────────────────────────────

export function startTrialLifecycleJobs(): void {
  startTrialExpiryJob();
  startTrialReminder7DayJob();
  startTrialReminder3DayJob();
  startTrialReminder1DayJob();
  startSubscriptionExpiryJob();
  logger.info('✅ Trial lifecycle jobs started');
}
