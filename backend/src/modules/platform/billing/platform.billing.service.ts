/**
 * Platform Billing Service
 *
 * Handles Stripe subscription lifecycle for organizations:
 * - Subscription checkout (TRIAL → paid plan)
 * - Plan upgrades / downgrades
 * - Billing portal sessions
 * - Subscription cancellation
 * - Stripe webhook event processing
 *
 * All write operations invalidate the org cache and create audit logs.
 */

import Stripe from 'stripe';
import { Organization, OrgPlan } from '../../../models/Organization';
import { AuditLog } from '../../../models/AuditLog';
import { NotFoundError, ValidationError, PaymentError } from '../../../lib/errors';
import { invalidateOrgCache } from '../../../middleware/tenantScope';
import { invalidateOrgSessions } from '../../../lib/cacheInvalidation';
import { enqueueEmail } from '../../../workers/emailWorker';
import { logger } from '../../../lib/logger';
import { env } from '../../../config/env';
import {
  ensureStripeCustomer,
  createSubscriptionCheckout,
  createBillingPortalSession,
  cancelSubscriptionAtPeriodEnd,
  cancelSubscriptionImmediately,
  updateSubscriptionPrice,
  retrieveSubscription,
  getPlanFromPriceId,
} from '../../../lib/stripe';

// ── Plan → Price ID map ────────────────────────────────────────────────────────

export type BillingInterval = 'monthly' | 'annual';

export function getPriceId(plan: OrgPlan, interval: BillingInterval): string | null {
  const map: Partial<Record<string, string>> = {
    STARTER_monthly:    env.STRIPE_PRICE_STARTER_MONTHLY,
    STARTER_annual:     env.STRIPE_PRICE_STARTER_ANNUAL,
    GROWTH_monthly:     env.STRIPE_PRICE_GROWTH_MONTHLY,
    GROWTH_annual:      env.STRIPE_PRICE_GROWTH_ANNUAL,
    ENTERPRISE_monthly: env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    ENTERPRISE_annual:  env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
  };
  return map[`${plan}_${interval}`] ?? null;
}

// ── Create subscription checkout ───────────────────────────────────────────────

export async function createOrgSubscriptionCheckout(
  orgId: string,
  plan: OrgPlan,
  interval: BillingInterval,
  frontendUrl?: string
): Promise<{ checkoutUrl: string }> {
  if (plan === 'TRIAL') throw new ValidationError('Cannot subscribe to TRIAL plan');

  const priceId = getPriceId(plan, interval);
  if (!priceId) {
    throw new ValidationError(
      `No Stripe price configured for ${plan}/${interval}. ` +
      `Set STRIPE_PRICE_${plan}_${interval.toUpperCase()} in environment.`
    );
  }

  const org = await Organization.findById(orgId).lean();
  if (!org) throw new NotFoundError('Organization');

  if (['ARCHIVED', 'REJECTED'].includes(org.status)) {
    throw new ValidationError('Cannot subscribe for an archived or rejected organization');
  }

  const customerId = await ensureStripeCustomer(orgId, org.ownerEmail, org.name);

  const base = frontendUrl ?? env.FRONTEND_URL;
  const session = await createSubscriptionCheckout({
    customerId,
    priceId,
    organizationId: orgId,
    orgSlug: org.slug,
    successUrl: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl:  `${base}/billing`,
    trialEnd: org.trialEndsAt ?? undefined,
  });

  logger.info({ orgId, plan, interval }, 'Subscription checkout session created');
  return { checkoutUrl: session.url! };
}

// ── Billing portal ─────────────────────────────────────────────────────────────

export async function createOrgBillingPortal(
  orgId: string,
  frontendUrl?: string
): Promise<{ portalUrl: string }> {
  const org = await Organization.findById(orgId).select('stripeCustomerId name').lean();
  if (!org) throw new NotFoundError('Organization');

  if (!org.stripeCustomerId) {
    throw new PaymentError('No billing account found. Subscribe to a plan first.');
  }

  const base = frontendUrl ?? env.FRONTEND_URL;
  const session = await createBillingPortalSession(
    org.stripeCustomerId,
    `${base}/billing`
  );

  return { portalUrl: session.url };
}

// ── Upgrade / downgrade plan ───────────────────────────────────────────────────

export async function changeOrgPlan(
  orgId: string,
  newPlan: OrgPlan,
  interval: BillingInterval,
  actorId: string,
  isPlatformAction = false
): Promise<void> {
  if (newPlan === 'TRIAL') throw new ValidationError('Cannot change to TRIAL plan');

  const priceId = getPriceId(newPlan, interval);
  if (!priceId) {
    throw new ValidationError(`No Stripe price configured for ${newPlan}/${interval}`);
  }

  const org = await Organization.findById(orgId).lean();
  if (!org) throw new NotFoundError('Organization');

  if (!org.stripeSubscriptionId) {
    throw new PaymentError('No active subscription found. Use checkout to subscribe first.');
  }

  await updateSubscriptionPrice(org.stripeSubscriptionId, priceId);

  const newLimits = Organization.getDefaultLimits(newPlan);
  await Organization.findByIdAndUpdate(orgId, {
    plan: newPlan,
    limits: newLimits,
    billingInterval: interval,
    stripePriceId: priceId,
  });

  await invalidateOrgCache(orgId);

  await AuditLog.create({
    organizationId: orgId,
    userId: actorId,
    action: 'ORG_PLAN_CHANGED',
    resource: 'Organization',
    resourceId: orgId,
    isPlatformAction,
    metadata: { oldPlan: org.plan, newPlan, interval },
  });

  logger.info({ orgId, oldPlan: org.plan, newPlan, interval }, 'Org plan changed');
}

// ── Cancel subscription ────────────────────────────────────────────────────────

export async function cancelOrgSubscription(
  orgId: string,
  actorId: string,
  immediate = false
): Promise<void> {
  const org = await Organization.findById(orgId).lean();
  if (!org) throw new NotFoundError('Organization');

  if (!org.stripeSubscriptionId) {
    throw new PaymentError('No active subscription to cancel');
  }

  if (immediate) {
    await cancelSubscriptionImmediately(org.stripeSubscriptionId);
    await Organization.findByIdAndUpdate(orgId, {
      stripeSubscriptionId: undefined,
      stripePriceId: undefined,
      plan: 'TRIAL',
      limits: Organization.getDefaultLimits('TRIAL'),
    });
  } else {
    // Cancel at period end — org stays active until billing cycle ends
    await cancelSubscriptionAtPeriodEnd(org.stripeSubscriptionId);
  }

  await invalidateOrgCache(orgId);

  await AuditLog.create({
    organizationId: orgId,
    userId: actorId,
    action: 'ORG_SUBSCRIPTION_CANCELLED',
    resource: 'Organization',
    resourceId: orgId,
    isPlatformAction: false,
    metadata: { immediate },
  });

  logger.info({ orgId, immediate }, 'Org subscription cancelled');
}

// ── Stripe webhook handler ─────────────────────────────────────────────────────

export async function handleSubscriptionWebhook(event: Stripe.Event): Promise<void> {
  logger.info({ type: event.type }, 'Processing Stripe subscription webhook');

  switch (event.type) {

    // ── Checkout completed → activate subscription ─────────────────────────
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') break; // invoice checkout handled elsewhere

      const orgId = session.metadata?.organizationId;
      if (!orgId) {
        logger.warn({ sessionId: session.id }, 'checkout.session.completed missing organizationId');
        break;
      }

      const subscriptionId = session.subscription as string;
      const subscription = await retrieveSubscription(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;
      const plan = priceId ? getPlanFromPriceId(priceId) : null;

      if (!plan) {
        logger.warn({ priceId, orgId }, 'Unknown price ID in checkout.session.completed');
        break;
      }

      const interval: BillingInterval =
        subscription.items.data[0]?.price.recurring?.interval === 'year' ? 'annual' : 'monthly';

      const periodEnd = new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000);
      const mrr = Math.round(
        (subscription.items.data[0]?.price.unit_amount ?? 0) /
        (interval === 'annual' ? 12 : 1)
      );

      await Organization.findByIdAndUpdate(orgId, {
        plan,
        status: 'ACTIVE',
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        billingInterval: interval,
        expiresAt: periodEnd,
        mrr,
        limits: Organization.getDefaultLimits(plan),
      });

      await invalidateOrgCache(orgId);

      const org = await Organization.findById(orgId).select('ownerEmail name').lean();
      if (org) {
        await enqueueEmail({
          type: 'org:reactivated',
          to: org.ownerEmail,
          organizationId: orgId,
          data: {
            ownerName: org.ownerEmail,
            orgName: org.name,
            plan,
            loginUrl: `${env.FRONTEND_URL}/dashboard`,
          },
        });
      }

      await AuditLog.create({
        organizationId: orgId,
        action: 'ORG_SUBSCRIPTION_ACTIVATED',
        resource: 'Organization',
        resourceId: orgId,
        isPlatformAction: false,
        metadata: { plan, interval, subscriptionId, mrr },
      });

      logger.info({ orgId, plan, interval, subscriptionId }, 'Subscription activated via checkout');
      break;
    }

    // ── Subscription updated (plan change, renewal, trial end) ────────────
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.organizationId;
      if (!orgId) break;

      const priceId = subscription.items.data[0]?.price.id;
      const plan = priceId ? getPlanFromPriceId(priceId) : null;
      if (!plan) break;

      const interval: BillingInterval =
        subscription.items.data[0]?.price.recurring?.interval === 'year' ? 'annual' : 'monthly';

      const periodEnd = new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000);
      const mrr = Math.round(
        (subscription.items.data[0]?.price.unit_amount ?? 0) /
        (interval === 'annual' ? 12 : 1)
      );

      const updateData: Record<string, unknown> = {
        plan,
        stripePriceId: priceId,
        billingInterval: interval,
        expiresAt: periodEnd,
        mrr,
        limits: Organization.getDefaultLimits(plan),
      };

      // If subscription is active, ensure org is ACTIVE
      if (subscription.status === 'active') {
        updateData.status = 'ACTIVE';
      }

      await Organization.findByIdAndUpdate(orgId, updateData);
      await invalidateOrgCache(orgId);

      logger.info({ orgId, plan, interval, status: subscription.status }, 'Subscription updated');
      break;
    }

    // ── Subscription deleted (cancelled immediately or at period end) ──────
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.organizationId;
      if (!orgId) break;

      await Organization.findByIdAndUpdate(orgId, {
        stripeSubscriptionId: undefined,
        stripePriceId: undefined,
        plan: 'TRIAL',
        status: 'EXPIRED_TRIAL',
        mrr: 0,
        limits: Organization.getDefaultLimits('TRIAL'),
      });

      await invalidateOrgCache(orgId);
      await invalidateOrgSessions(orgId);

      const org = await Organization.findById(orgId).select('ownerEmail name').lean();
      if (org) {
        await enqueueEmail({
          type: 'org:suspended',
          to: org.ownerEmail,
          organizationId: orgId,
          data: {
            ownerName: org.ownerEmail,
            orgName: org.name,
            reason: 'Your subscription has been cancelled',
            supportUrl: `${env.FRONTEND_URL}/support`,
          },
        });
      }

      await AuditLog.create({
        organizationId: orgId,
        action: 'ORG_SUBSCRIPTION_DELETED',
        resource: 'Organization',
        resourceId: orgId,
        isPlatformAction: false,
        metadata: { subscriptionId: subscription.id },
      });

      logger.info({ orgId }, 'Subscription deleted — org set to EXPIRED_TRIAL');
      break;
    }

    // ── Payment succeeded (renewal) ────────────────────────────────────────
    case 'invoice.payment_succeeded': {
      const stripeInvoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (stripeInvoice as unknown as { subscription: string }).subscription;
      if (!subscriptionId) break;

      const subscription = await retrieveSubscription(subscriptionId);
      const orgId = subscription.metadata?.organizationId;
      if (!orgId) break;

      const periodEnd = new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000);

      await Organization.findByIdAndUpdate(orgId, {
        status: 'ACTIVE',
        expiresAt: periodEnd,
      });

      await invalidateOrgCache(orgId);
      logger.info({ orgId, subscriptionId }, 'Payment succeeded — subscription renewed');
      break;
    }

    // ── Payment failed ─────────────────────────────────────────────────────
    case 'invoice.payment_failed': {
      const stripeInvoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (stripeInvoice as unknown as { subscription: string }).subscription;
      if (!subscriptionId) break;

      const subscription = await retrieveSubscription(subscriptionId);
      const orgId = subscription.metadata?.organizationId;
      if (!orgId) break;

      const org = await Organization.findById(orgId).select('ownerEmail name').lean();
      if (!org) break;

      // Stripe will retry — we just notify the owner
      await enqueueEmail({
        type: 'org:payment-overdue-grace',
        to: org.ownerEmail,
        organizationId: orgId,
        data: {
          ownerName: org.ownerEmail,
          orgName: org.name,
          gracePeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          updateBillingUrl: `${env.FRONTEND_URL}/billing`,
        },
      });

      await AuditLog.create({
        organizationId: orgId,
        action: 'ORG_PAYMENT_FAILED',
        resource: 'Organization',
        resourceId: orgId,
        isPlatformAction: false,
        metadata: { subscriptionId, attemptCount: (stripeInvoice as unknown as { attempt_count: number }).attempt_count },
      });

      logger.warn({ orgId, subscriptionId }, 'Payment failed — owner notified');
      break;
    }

    default:
      logger.debug({ type: event.type }, 'Unhandled Stripe subscription webhook event');
  }
}
