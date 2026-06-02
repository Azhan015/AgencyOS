import argon2 from 'argon2';
import mongoose from 'mongoose';
import { Organization, IOrganization } from '../../models/Organization';
import { User } from '../../models/User';
import { Invoice } from '../../models/Invoice';
import { AuditLog } from '../../models/AuditLog';
import { generateSlug, generateSecureToken } from '../../lib/crypto';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import {
  ConflictError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  RateLimitError,
} from '../../lib/errors';
import { enqueueEmail } from '../../workers/emailWorker';
import { invalidateOrgSessions, purgeOrgCache, CacheGroups, invalidateCache } from '../../lib/cacheInvalidation';
import type { RegisterOrganizationInput, UpdateOrganizationInput, InviteUserInput } from './organizations.schemas';

// ── Register a new organization ────────────────────────────────────────────────

export async function registerOrganization(
  data: RegisterOrganizationInput,
  ip: string,
  userAgent: string
): Promise<{ organizationId: string; slug: string; status: string; message: string }> {

  // 1. Honeypot check — bots fill hidden fields
  if ((data as Record<string, unknown>)._gotcha) {
    // Silent reject — don't reveal the honeypot
    return {
      organizationId: 'pending',
      slug: '',
      status: 'PENDING_APPROVAL',
      message: 'Registration submitted. You will receive an email within 24–48 hours.',
    };
  }

  // 2. Service-level IP rate limit (in addition to middleware limiter)
  const rateKey = `rate:org-register:${ip}`;
  const attempts = await cacheGet<string>(rateKey);
  if (parseInt(attempts ?? '0', 10) >= 5) {
    throw new RateLimitError('Too many registration attempts from this IP. Try again in an hour.');
  }
  await cacheSet(rateKey, String(parseInt(attempts ?? '0', 10) + 1), 3600);

  // 3. Check email not already registered globally
  const existingUser = await User.findOne({ email: data.ownerEmail }).lean();
  if (existingUser) {
    throw new ConflictError('An account with this email already exists');
  }

  // 4. Generate and validate slug
  let slug = data.orgSlug ?? generateSlug(data.orgName);
  const slugTaken = await Organization.findOne({ slug }).lean();
  if (slugTaken) {
    slug = `${slug}-${generateSecureToken(2)}`;
  }

  // 5. Create Organization (PENDING_APPROVAL)
  const org = await Organization.create({
    name: data.orgName,
    slug,
    status: 'PENDING_APPROVAL',
    plan: 'TRIAL',
    ownerEmail: data.ownerEmail,
    contactPhone: data.contactPhone,
    address: data.address,
    registrationIp: ip,
    registrationUserAgent: userAgent,
    registeredAt: new Date(),
    approvalSubmittedAt: new Date(),
    limits: Organization.getDefaultLimits('TRIAL'),
    metadata: {
      referralSource: data.referralSource,
      acceptedTermsAt: data.acceptedTermsAt,
      acceptedPrivacyAt: data.acceptedPrivacyAt,
    },
  });

  // 6. Create ORGANIZATION_OWNER user (inactive until approved)
  const passwordHash = await argon2.hash(data.ownerPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const owner = await User.create({
    email: data.ownerEmail,
    passwordHash,
    name: data.ownerName,
    organizationId: org._id,
    orgRole: 'ORGANIZATION_OWNER',
    role: 'ADMIN',           // legacy field — maps to ORGANIZATION_OWNER
    isActive: false,          // inactive until org is approved
  });

  // 7. Increment org seat usage
  await Organization.updateOne({ _id: org._id }, { $inc: { 'usage.seats': 1 } });

  // 8. Enqueue lifecycle emails
  await enqueueEmail({
    type: 'org:registration-received',
    to: data.ownerEmail,
    data: {
      ownerName: data.ownerName,
      orgName: data.orgName,
      slug,
      estimatedReviewTime: '24–48 hours',
    },
  });

  // Notify platform admins
  const platformAdmins = await (await import('../../models/PlatformUser')).PlatformUser
    .find({ isActive: true })
    .select('email')
    .lean();

  for (const admin of platformAdmins) {
    await enqueueEmail({
      type: 'platform:new-org-pending',
      to: admin.email,
      data: {
        orgId: org._id.toString(),
        orgName: data.orgName,
        ownerEmail: data.ownerEmail,
        platformUrl: env.FRONTEND_URL,
      },
    });
  }

  // 9. Audit log
  await AuditLog.create({
    organizationId: org._id,
    userId: owner._id,
    action: 'ORGANIZATION_REGISTERED',
    resource: 'Organization',
    resourceId: org._id.toString(),
    isPlatformAction: false,
    ip,
    userAgent,
    metadata: { slug, ownerEmail: data.ownerEmail },
  });

  logger.info({ orgId: org._id, slug, ownerEmail: data.ownerEmail }, 'Organization registered');

  return {
    organizationId: org._id.toString(),
    slug,
    status: 'PENDING_APPROVAL',
    message: 'Registration submitted. You will receive an email within 24–48 hours.',
  };
}

// ── Check slug availability ────────────────────────────────────────────────────

export async function checkSlugAvailability(slug: string): Promise<{ available: boolean; suggestion?: string }> {
  const existing = await Organization.findOne({ slug }).lean();
  if (!existing) return { available: true };

  // Generate a suggestion
  const suggestion = `${slug}-${generateSecureToken(2)}`;
  return { available: false, suggestion };
}

// ── Get registration status by slug ───────────────────────────────────────────

export async function getRegistrationStatus(slug: string): Promise<{ status: string; name: string } | null> {
  const org = await Organization.findOne({ slug }).select('status name').lean();
  if (!org) return null;
  return { status: org.status, name: org.name };
}

// ── Get own organization (for ORGANIZATION_OWNER/ADMIN) ───────────────────────

export async function getOwnOrganization(orgId: string): Promise<IOrganization> {
  const cacheKey = `org:${orgId}:meta`;
  const cached = await cacheGet<string>(cacheKey);
  if (cached) {
    return (typeof cached === 'string' ? JSON.parse(cached) : cached) as IOrganization;
  }

  const org = await Organization.findById(orgId).lean();
  if (!org) throw new NotFoundError('Organization');

  await cacheSet(cacheKey, JSON.stringify(org), 300);
  return org as IOrganization;
}

// ── Update org profile ─────────────────────────────────────────────────────────

export async function updateOrganization(
  orgId: string,
  data: UpdateOrganizationInput,
  userId: string
): Promise<IOrganization> {
  const updated = await Organization.findByIdAndUpdate(
    orgId,
    { $set: data },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) throw new NotFoundError('Organization');

  await invalidateCache(CacheGroups.orgMeta(orgId));

  await AuditLog.create({
    organizationId: orgId,
    userId,
    action: 'ORGANIZATION_UPDATED',
    resource: 'Organization',
    resourceId: orgId,
    metadata: { fields: Object.keys(data) },
  });

  return updated as IOrganization;
}

// ── Get usage vs limits ────────────────────────────────────────────────────────

export async function getOrganizationUsage(orgId: string) {
  const org = await Organization.findById(orgId).select('usage limits plan').lean();
  if (!org) throw new NotFoundError('Organization');

  return {
    plan: org.plan,
    usage: org.usage,
    limits: org.limits,
    percentages: {
      seats: org.limits.seats === -1 ? 0 : Math.round((org.usage.seats / org.limits.seats) * 100),
      storage: org.limits.storageBytes === -1 ? 0 : Math.round((org.usage.storageUsedBytes / org.limits.storageBytes) * 100),
      projects: org.limits.projects === -1 ? 0 : Math.round((org.usage.projects / org.limits.projects) * 100),
      clients: org.limits.clients === -1 ? 0 : Math.round((org.usage.clients / org.limits.clients) * 100),
    },
  };
}

// ── Invite a team member ───────────────────────────────────────────────────────

export async function inviteTeamMember(
  orgId: string,
  data: InviteUserInput,
  invitedBy: string,
  frontendUrl?: string
): Promise<void> {
  // Check seat limit
  const org = await Organization.findById(orgId).select('limits usage name').lean();
  if (!org) throw new NotFoundError('Organization');

  if (org.limits.seats !== -1 && org.usage.seats >= org.limits.seats) {
    throw new ConflictError(
      `Seat limit reached (${org.usage.seats}/${org.limits.seats}). Upgrade your plan to add more team members.`
    );
  }

  // Check email not already in this org
  const existing = await User.findOne({ email: data.email, organizationId: orgId }).lean();
  if (existing) throw new ConflictError('A user with this email already exists in your organization');

  // Generate temp password
  const tempPassword = generateSecureToken(8); // 16-char hex
  const passwordHash = await argon2.hash(tempPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // Map org role to legacy role
  const legacyRoleMap: Record<string, string> = {
    ORGANIZATION_ADMIN: 'ADMIN',
    PROJECT_MANAGER: 'PROJECT_MANAGER',
    CONTRIBUTOR: 'CONTRIBUTOR',
  };

  const user = await User.create({
    email: data.email,
    name: data.name,
    passwordHash,
    organizationId: orgId,
    orgRole: data.role,
    role: legacyRoleMap[data.role] ?? 'CONTRIBUTOR',
    isActive: true,
  });

  // Increment seat usage
  await Organization.updateOne({ _id: orgId }, { $inc: { 'usage.seats': 1 } });

  const base = frontendUrl ?? env.FRONTEND_URL;
  await enqueueEmail({
    type: 'team:invited',
    to: data.email,
    organizationId: orgId,
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      agencyName: org.name,
      loginUrl: `${base}/auth/login`,
      tempPassword,
    },
  });

  await AuditLog.create({
    organizationId: orgId,
    userId: invitedBy,
    action: 'TEAM_MEMBER_INVITED',
    resource: 'User',
    resourceId: user._id.toString(),
    metadata: { email: data.email, role: data.role },
  });

  logger.info({ orgId, email: data.email, role: data.role }, 'Team member invited');
}

// ── Transfer ownership ─────────────────────────────────────────────────────────

export async function transferOwnership(
  currentOwnerId: string,
  organizationId: string,
  newOwnerId: string,
  confirmPassword: string,
  frontendUrl?: string
): Promise<void> {
  // 1. Verify current owner's password
  const currentOwner = await User.findById(currentOwnerId).select('+passwordHash').lean();
  if (!currentOwner?.passwordHash) throw new AuthenticationError('Password confirmation failed');

  const passwordValid = await argon2.verify(currentOwner.passwordHash, confirmPassword);
  if (!passwordValid) throw new AuthenticationError('Password confirmation failed');

  // 2. Verify new owner is in same org and is ORGANIZATION_ADMIN
  const newOwner = await User.findOne({
    _id: newOwnerId,
    organizationId,
    orgRole: 'ORGANIZATION_ADMIN',
    isActive: true,
  }).lean();
  if (!newOwner) {
    throw new ValidationError('Target user must be an active ORGANIZATION_ADMIN in your organization');
  }

  // 3. Atomic swap in transaction
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await User.updateOne(
        { _id: currentOwnerId },
        { orgRole: 'ORGANIZATION_ADMIN', role: 'ADMIN' },
        { session }
      );
      await User.updateOne(
        { _id: newOwnerId },
        { orgRole: 'ORGANIZATION_OWNER', role: 'ADMIN' },
        { session }
      );
      await Organization.updateOne(
        { _id: organizationId },
        { ownerEmail: newOwner.email },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  // 4. Invalidate caches
  await invalidateCache([
    ...CacheGroups.user(organizationId, currentOwnerId),
    ...CacheGroups.user(organizationId, newOwnerId),
    ...CacheGroups.orgMeta(organizationId),
  ]);

  // 5. Audit + notification
  await AuditLog.create({
    organizationId,
    userId: currentOwnerId,
    action: 'OWNERSHIP_TRANSFERRED',
    resource: 'Organization',
    resourceId: organizationId,
    metadata: { from: currentOwnerId, to: newOwnerId },
  });

  const base = frontendUrl ?? env.FRONTEND_URL;
  const org = await Organization.findById(organizationId).select('name').lean();

  await enqueueEmail({
    type: 'org:ownership-transferred',
    to: newOwner.email,
    organizationId,
    data: {
      newOwnerName: newOwner.name,
      orgName: org?.name ?? 'your organization',
      loginUrl: `${base}/dashboard`,
    },
  });

  logger.info({ organizationId, from: currentOwnerId, to: newOwnerId }, 'Ownership transferred');
}

// ── Request organization deletion ──────────────────────────────────────────────

export async function requestOrganizationDeletion(
  ownerId: string,
  orgId: string,
  reason?: string
): Promise<void> {
  const org = await Organization.findById(orgId).lean();
  if (!org) throw new NotFoundError('Organization');

  // Cannot delete with active Stripe subscription
  if (org.stripeSubscriptionId) {
    throw new ConflictError(
      'Cancel your subscription before deleting the organization. Visit billing settings to cancel.'
    );
  }

  // Cannot delete with outstanding invoices
  const unpaidCount = await Invoice.countDocuments({
    organizationId: orgId,
    status: { $in: ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'] },
  });
  if (unpaidCount > 0) {
    throw new ConflictError(
      `Cannot delete organization with ${unpaidCount} outstanding invoice(s). Resolve all invoices first.`
    );
  }

  // Schedule deletion 30 days out (grace period + legal hold)
  const deletionScheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await Organization.updateOne({ _id: orgId }, {
    status: 'ARCHIVED',
    archivedAt: new Date(),
    metadata: {
      ...org.metadata,
      deletionReason: reason,
      deletionScheduledFor: deletionScheduledFor.toISOString(),
      deletionRequestedBy: ownerId,
    },
  });

  // Deactivate all users
  await User.updateMany({ organizationId: orgId }, { isActive: false });

  // Invalidate all sessions
  await invalidateOrgSessions(orgId);
  await purgeOrgCache(orgId);

  // Email owner
  await enqueueEmail({
    type: 'org:deletion-scheduled',
    to: org.ownerEmail,
    data: {
      ownerName: org.ownerEmail,
      orgName: org.name,
      deletionDate: deletionScheduledFor,
      cancelUrl: env.FRONTEND_URL,
    },
  });

  // Alert platform admins
  const platformAdmins = await (await import('../../models/PlatformUser')).PlatformUser
    .find({ isActive: true })
    .select('email')
    .lean();

  for (const admin of platformAdmins) {
    await enqueueEmail({
      type: 'platform:org-deletion-requested',
      to: admin.email,
      data: {
        orgId,
        orgName: org.name,
        ownerId,
        reason,
        deletionScheduledFor,
        platformUrl: env.FRONTEND_URL,
      },
    });
  }

  await AuditLog.create({
    organizationId: orgId,
    userId: ownerId,
    action: 'ORGANIZATION_DELETION_REQUESTED',
    resource: 'Organization',
    resourceId: orgId,
    metadata: { reason, deletionScheduledFor },
  });

  logger.info({ orgId, ownerId, deletionScheduledFor }, 'Organization deletion scheduled');
}

// ── Get billing info ───────────────────────────────────────────────────────────

export async function getOrganizationBilling(orgId: string) {
  const org = await Organization.findById(orgId)
    .select('plan limits usage stripeCustomerId stripeSubscriptionId stripePriceId billingEmail billingInterval mrr trialStartsAt trialEndsAt expiresAt')
    .lean();

  if (!org) throw new NotFoundError('Organization');
  return org;
}
