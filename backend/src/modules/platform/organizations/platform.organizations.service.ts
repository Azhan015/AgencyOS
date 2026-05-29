import { Organization, IOrganization, OrgStatus, OrgPlan } from '../../../models/Organization';
import { User } from '../../../models/User';
import { AuditLog } from '../../../models/AuditLog';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import { invalidateOrgCache } from '../../../middleware/tenantScope';
import { logger } from '../../../lib/logger';

export async function listOrganizations(query: {
  page?: number;
  limit?: number;
  status?: OrgStatus;
  plan?: OrgPlan;
  search?: string;
}) {
  const { page = 1, limit = 20, status, plan, search } = query;
  const filter: Record<string, unknown> = {};

  if (status) filter.status = status;
  if (plan) filter.plan = plan;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
      { ownerEmail: { $regex: search, $options: 'i' } },
    ];
  }

  const [orgs, total] = await Promise.all([
    Organization.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Organization.countDocuments(filter),
  ]);

  return { orgs, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getPendingOrganizations() {
  return Organization.find({ status: 'PENDING_APPROVAL' })
    .sort({ registeredAt: 1 }) // oldest first
    .lean();
}

export async function getOrganization(id: string): Promise<IOrganization> {
  const org = await Organization.findById(id);
  if (!org) throw new NotFoundError('Organization');
  return org;
}

export async function getOrganizationUsers(orgId: string, query: { page?: number; limit?: number }) {
  const { page = 1, limit = 20 } = query;
  const [users, total] = await Promise.all([
    User.find({ organizationId: orgId })
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments({ organizationId: orgId }),
  ]);
  return { users, total, page, limit };
}

export async function approveOrganization(
  orgId: string,
  reviewerId: string,
  notes?: string
): Promise<IOrganization> {
  const org = await Organization.findById(orgId);
  if (!org) throw new NotFoundError('Organization');

  if (!['PENDING_APPROVAL', 'APPROVED'].includes(org.status)) {
    throw new ValidationError(`Cannot approve organization with status: ${org.status}`);
  }

  const trialDays = 14;
  const trialStartsAt = new Date();
  const trialEndsAt = new Date(trialStartsAt.getTime() + trialDays * 24 * 60 * 60 * 1000);

  const updated = await Organization.findByIdAndUpdate(
    orgId,
    {
      status: 'ACTIVE',
      approvedAt: new Date(),
      approvalReviewedBy: reviewerId,
      approvalNotes: notes,
      trialStartsAt,
      trialEndsAt,
      plan: 'TRIAL',
      limits: Organization.getDefaultLimits('TRIAL'),
    },
    { new: true }
  );

  if (!updated) throw new NotFoundError('Organization');

  await invalidateOrgCache(orgId);

  await AuditLog.create({
    userId: reviewerId,
    action: 'ORG_APPROVED',
    resource: 'Organization',
    resourceId: orgId,
    isPlatformAction: true,
    metadata: { notes, trialEndsAt },
  });

  logger.info({ orgId, reviewerId }, 'Organization approved');
  return updated;
}

export async function rejectOrganization(
  orgId: string,
  reviewerId: string,
  reason: string
): Promise<IOrganization> {
  const org = await Organization.findById(orgId);
  if (!org) throw new NotFoundError('Organization');

  if (org.status !== 'PENDING_APPROVAL') {
    throw new ValidationError(`Cannot reject organization with status: ${org.status}`);
  }

  const updated = await Organization.findByIdAndUpdate(
    orgId,
    {
      status: 'REJECTED',
      rejectedAt: new Date(),
      approvalReviewedBy: reviewerId,
      rejectionReason: reason,
    },
    { new: true }
  );

  if (!updated) throw new NotFoundError('Organization');

  await invalidateOrgCache(orgId);

  await AuditLog.create({
    userId: reviewerId,
    action: 'ORG_REJECTED',
    resource: 'Organization',
    resourceId: orgId,
    isPlatformAction: true,
    metadata: { reason },
  });

  logger.info({ orgId, reviewerId, reason }, 'Organization rejected');
  return updated;
}

export async function suspendOrganization(
  orgId: string,
  reviewerId: string,
  reason?: string
): Promise<IOrganization> {
  const org = await Organization.findById(orgId);
  if (!org) throw new NotFoundError('Organization');

  if (['ARCHIVED', 'REJECTED'].includes(org.status)) {
    throw new ValidationError(`Cannot suspend organization with status: ${org.status}`);
  }

  const updated = await Organization.findByIdAndUpdate(
    orgId,
    { status: 'SUSPENDED', suspendedAt: new Date() },
    { new: true }
  );

  if (!updated) throw new NotFoundError('Organization');

  await invalidateOrgCache(orgId);

  await AuditLog.create({
    userId: reviewerId,
    action: 'ORG_SUSPENDED',
    resource: 'Organization',
    resourceId: orgId,
    isPlatformAction: true,
    metadata: { reason },
  });

  logger.info({ orgId, reviewerId }, 'Organization suspended');
  return updated;
}

export async function reactivateOrganization(
  orgId: string,
  reviewerId: string
): Promise<IOrganization> {
  const org = await Organization.findById(orgId);
  if (!org) throw new NotFoundError('Organization');

  if (org.status !== 'SUSPENDED') {
    throw new ValidationError(`Cannot reactivate organization with status: ${org.status}`);
  }

  const updated = await Organization.findByIdAndUpdate(
    orgId,
    { status: 'ACTIVE', suspendedAt: undefined },
    { new: true }
  );

  if (!updated) throw new NotFoundError('Organization');

  await invalidateOrgCache(orgId);

  await AuditLog.create({
    userId: reviewerId,
    action: 'ORG_REACTIVATED',
    resource: 'Organization',
    resourceId: orgId,
    isPlatformAction: true,
  });

  return updated;
}

export async function updateOrganizationPlan(
  orgId: string,
  plan: OrgPlan,
  reviewerId: string
): Promise<IOrganization> {
  const org = await Organization.findById(orgId);
  if (!org) throw new NotFoundError('Organization');

  const limits = Organization.getDefaultLimits(plan);

  const updated = await Organization.findByIdAndUpdate(
    orgId,
    { plan, limits },
    { new: true }
  );

  if (!updated) throw new NotFoundError('Organization');

  await invalidateOrgCache(orgId);

  await AuditLog.create({
    userId: reviewerId,
    action: 'ORG_PLAN_CHANGED',
    resource: 'Organization',
    resourceId: orgId,
    isPlatformAction: true,
    metadata: { oldPlan: org.plan, newPlan: plan },
  });

  return updated;
}

export async function updateOrganizationFeatures(
  orgId: string,
  features: Partial<IOrganization['features']>,
  reviewerId: string
): Promise<IOrganization> {
  const org = await Organization.findById(orgId);
  if (!org) throw new NotFoundError('Organization');

  const featureUpdate: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(features)) {
    featureUpdate[`features.${key}`] = value;
  }

  const updated = await Organization.findByIdAndUpdate(
    orgId,
    { $set: featureUpdate },
    { new: true }
  );

  if (!updated) throw new NotFoundError('Organization');

  await invalidateOrgCache(orgId);

  await AuditLog.create({
    userId: reviewerId,
    action: 'ORG_FEATURES_UPDATED',
    resource: 'Organization',
    resourceId: orgId,
    isPlatformAction: true,
    metadata: { features },
  });

  return updated;
}

export async function extendTrial(
  orgId: string,
  additionalDays: number,
  reviewerId: string
): Promise<IOrganization> {
  const org = await Organization.findById(orgId);
  if (!org) throw new NotFoundError('Organization');

  const currentEnd = org.trialEndsAt || new Date();
  const newEnd = new Date(currentEnd.getTime() + additionalDays * 24 * 60 * 60 * 1000);

  const updated = await Organization.findByIdAndUpdate(
    orgId,
    { trialEndsAt: newEnd },
    { new: true }
  );

  if (!updated) throw new NotFoundError('Organization');

  await invalidateOrgCache(orgId);

  await AuditLog.create({
    userId: reviewerId,
    action: 'ORG_TRIAL_EXTENDED',
    resource: 'Organization',
    resourceId: orgId,
    isPlatformAction: true,
    metadata: { additionalDays, newTrialEnd: newEnd },
  });

  return updated;
}

export async function getOrganizationAuditLogs(orgId: string, query: { page?: number; limit?: number }) {
  const { page = 1, limit = 50 } = query;
  const [logs, total] = await Promise.all([
    AuditLog.find({ organizationId: orgId })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments({ organizationId: orgId }),
  ]);
  return { logs, total, page, limit };
}
