import Stripe from 'stripe';
import { env } from '../config/env';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('Stripe secret key not configured');
    }
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      typescript: true,
    });
  }
  return stripeClient;
}

export async function createStripeCustomer(email: string, name: string, metadata?: Record<string, string>): Promise<string> {
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name,
    metadata,
  });
  return customer.id;
}

export async function createPaymentIntent(
  amount: number,
  currency: string,
  customerId: string,
  metadata?: Record<string, string>
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency: currency.toLowerCase(),
    customer: customerId,
    metadata,
    automatic_payment_methods: { enabled: true },
  });
}

export async function createCheckoutSession(
  customerId: string,
  lineItems: Array<{ name: string; amount: number; currency: string; quantity: number }>,
  successUrl: string,
  cancelUrl: string,
  metadata?: Record<string, string>
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: lineItems.map(item => ({
      price_data: {
        currency: item.currency.toLowerCase(),
        product_data: { name: item.name },
        unit_amount: Math.round(item.amount * 100),
      },
      quantity: item.quantity,
    })),
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

export function constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
  const stripe = getStripe();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhook secret not configured');
  }
  return stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
}

export async function retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

export async function createRefund(paymentIntentId: string, amount?: number): Promise<Stripe.Refund> {
  const stripe = getStripe();
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amount ? Math.round(amount * 100) : undefined,
  });
}

// ── Subscription helpers ───────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout Session for a subscription.
 * Used when an org upgrades from TRIAL to a paid plan.
 */
export async function createSubscriptionCheckout(opts: {
  customerId: string;
  priceId: string;
  organizationId: string;
  orgSlug: string;
  successUrl: string;
  cancelUrl: string;
  trialEnd?: Date;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();

  const params: Stripe.Checkout.SessionCreateParams = {
    customer: opts.customerId,
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: {
      organizationId: opts.organizationId,
      orgSlug: opts.orgSlug,
    },
    subscription_data: {
      metadata: {
        organizationId: opts.organizationId,
        orgSlug: opts.orgSlug,
      },
    },
  };

  // If org is still in trial, honour remaining trial days
  if (opts.trialEnd && opts.trialEnd > new Date()) {
    params.subscription_data!.trial_end = Math.floor(opts.trialEnd.getTime() / 1000);
  }

  return stripe.checkout.sessions.create(params);
}

/**
 * Create a Stripe Billing Portal session so the org owner can manage
 * their subscription, update payment method, download invoices, etc.
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

/**
 * Retrieve a Stripe subscription.
 */
export async function retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId);
}

/**
 * Cancel a Stripe subscription at period end (graceful cancellation).
 */
export async function cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

/**
 * Immediately cancel a Stripe subscription (used on org deletion).
 */
export async function cancelSubscriptionImmediately(subscriptionId: string): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.cancel(subscriptionId);
}

/**
 * Update a subscription to a new price (plan upgrade/downgrade).
 */
export async function updateSubscriptionPrice(
  subscriptionId: string,
  newPriceId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) throw new Error('No subscription item found');

  return stripe.subscriptions.update(subscriptionId, {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: 'create_prorations',
  });
}

/**
 * Ensure a Stripe customer exists for an org. Creates one if missing.
 */
export async function ensureStripeCustomer(
  organizationId: string,
  email: string,
  name: string
): Promise<string> {
  const { Organization } = await import('../models/Organization');
  const org = await Organization.findById(organizationId).select('stripeCustomerId').lean();

  if (org?.stripeCustomerId) return org.stripeCustomerId;

  const customerId = await createStripeCustomer(email, name, { organizationId });
  await Organization.findByIdAndUpdate(organizationId, { stripeCustomerId: customerId });
  return customerId;
}

/**
 * Map a Stripe Price ID to an OrgPlan.
 * Returns null if the price ID is not recognised.
 */
export function getPlanFromPriceId(priceId: string): import('../models/Organization').OrgPlan | null {
  const { env } = require('../config/env');
  const map: Record<string, import('../models/Organization').OrgPlan> = {};

  if (env.STRIPE_PRICE_STARTER_MONTHLY)  map[env.STRIPE_PRICE_STARTER_MONTHLY]  = 'STARTER';
  if (env.STRIPE_PRICE_STARTER_ANNUAL)   map[env.STRIPE_PRICE_STARTER_ANNUAL]   = 'STARTER';
  if (env.STRIPE_PRICE_GROWTH_MONTHLY)   map[env.STRIPE_PRICE_GROWTH_MONTHLY]   = 'GROWTH';
  if (env.STRIPE_PRICE_GROWTH_ANNUAL)    map[env.STRIPE_PRICE_GROWTH_ANNUAL]    = 'GROWTH';
  if (env.STRIPE_PRICE_ENTERPRISE_MONTHLY) map[env.STRIPE_PRICE_ENTERPRISE_MONTHLY] = 'ENTERPRISE';
  if (env.STRIPE_PRICE_ENTERPRISE_ANNUAL)  map[env.STRIPE_PRICE_ENTERPRISE_ANNUAL]  = 'ENTERPRISE';

  return map[priceId] ?? null;
}
