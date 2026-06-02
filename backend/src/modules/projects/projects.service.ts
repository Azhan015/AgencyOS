import mongoose from 'mongoose';
import { Project, IProject, IMilestone } from '../../models/Project';
import { Task } from '../../models/Task';
import { Channel } from '../../models/Channel';
import { generateSlug } from '../../lib/crypto';
import { cacheDel } from '../../config/redis';
import { NotFoundError, AuthorizationError } from '../../lib/errors';
import { emitAutomationEvent } from '../automations/automations.service';
import { createNotification } from '../notifications/notifications.service';
import { assertSameOrg } from '../../middleware/tenantScope';

export async function listProjects(query: {
  userId: string;
  userRole: string;
  orgRole?: string;
  organizationId?: string;
  clientId?: string;
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
}) {
  const { userId, userRole, orgRole, organizationId, clientId, status, page = 1, limit = 20, search } = query;

  // organizationId is ALWAYS the first filter — never optional for multi-tenant
  const filter: Record<string, unknown> = {};
  if (organizationId) filter.organizationId = organizationId;

  // Role-based scoping (check both new orgRole and legacy role)
  const effectiveRole = orgRole || userRole;
  if (effectiveRole === 'CLIENT') {
    filter.clientId = clientId;
  } else if (effectiveRole === 'PROJECT_MANAGER') {
    filter.$or = [{ pm: userId }, { contributors: userId }];
  } else if (effectiveRole === 'CONTRIBUTOR') {
    filter.contributors = userId;
  }
  // ORGANIZATION_OWNER, ORGANIZATION_ADMIN, ADMIN, SUPERADMIN see all org projects

  if (clientId && !['CLIENT'].includes(effectiveRole)) filter.clientId = clientId;
  if (status) filter.status = status;
  if (search) filter.name = { $regex: search, $options: 'i' };

  const [projects, total] = await Promise.all([
    Project.find(filter)
      .populate('pm', 'name email avatar')
      .populate('contributors', 'name email avatar')
      .populate('clientId', 'companyName slug')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Project.countDocuments(filter),
  ]);

  return { projects, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getProject(
  id: string,
  userId: string,
  userRole: string,
  clientId?: string,
  organizationId?: string,
  orgRole?: string
): Promise<IProject> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const project = await Project.findOne(filter)
    .populate('pm', 'name email avatar')
    .populate('contributors', 'name email avatar')
    .populate('clientId', 'companyName slug email contactName')
    .populate('brief');

  if (!project) throw new NotFoundError('Project');

  // Tenant isolation check
  if (organizationId) {
    assertSameOrg(project.organizationId.toString(), organizationId);
  }

  // Role-based access control
  const effectiveRole = orgRole || userRole;
  if (effectiveRole === 'CLIENT' && (project.clientId as unknown as { _id: { toString(): string } })?._id?.toString() !== clientId) {
    throw new AuthorizationError();
  }
  if (effectiveRole === 'CONTRIBUTOR') {
    const isContributor = project.contributors.some(c => c.toString() === userId);
    if (!isContributor) throw new AuthorizationError();
  }

  return project;
}

export async function createProject(data: {
  name: string;
  clientId: string;
  type?: string;
  pm: string;
  contributors?: string[];
  budget?: number;
  currency?: string;
  startDate?: Date;
  endDate?: Date;
  description?: string;
  tags?: string[];
  milestones?: Array<{ name: string; dueDate: Date; invoiceAmount?: number; triggerInvoice?: boolean; order?: number }>;
  organizationId?: string;
}): Promise<IProject> {
  const slug = generateSlug(data.name);

  const project = await Project.create({
    ...data,
    slug,
    status: 'SCOPING',
  });

  // Create default project channel (org-scoped)
  await Channel.create({
    projectId: project._id,
    organizationId: data.organizationId,
    name: 'general',
    type: 'PROJECT',
    members: [data.pm, ...(data.contributors || [])],
    createdBy: data.pm,
  });

  // Notify PM
  await createNotification({
    userId: data.pm,
    type: 'PROJECT_STATUS_CHANGED',
    title: 'New project created',
    body: `Project "${data.name}" has been created`,
    link: `/projects/${project._id}`,
    metadata: { projectId: project._id.toString() },
    organizationId: data.organizationId,
  });

  return project;
}

export async function updateProject(
  id: string,
  data: Partial<IProject>,
  userId: string,
  userRole: string,
  organizationId?: string
): Promise<IProject> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const project = await Project.findOne(filter);
  if (!project) throw new NotFoundError('Project');

  const oldStatus = project.status;

  const updated = await Project.findOneAndUpdate(
    filter,
    { $set: data },
    { new: true, runValidators: true }
  ).populate('pm contributors clientId');

  if (!updated) throw new NotFoundError('Project');

  await cacheDel(`project:${id}`);

  if (data.status && data.status !== oldStatus) {
    await emitAutomationEvent('project.status_changed', {
      projectId: id,
      oldStatus,
      newStatus: data.status,
      project: updated.toObject(),
      organizationId,
    });
  }

  return updated;
}

export async function updateProjectStatus(
  id: string,
  status: string,
  userId: string,
  userRole: string,
  organizationId?: string
): Promise<IProject> {
  return updateProject(id, { status: status as IProject['status'] }, userId, userRole, organizationId);
}

export async function addMilestone(
  projectId: string,
  data: {
    name: string;
    dueDate: Date;
    invoiceAmount?: number;
    triggerInvoice?: boolean;
    order?: number;
  },
  organizationId?: string
): Promise<IProject> {
  const filter: Record<string, unknown> = { _id: projectId };
  if (organizationId) filter.organizationId = organizationId;

  const project = await Project.findOneAndUpdate(
    filter,
    { $push: { milestones: { ...data, status: 'PENDING', _id: new mongoose.Types.ObjectId() } } },
    { new: true }
  );
  if (!project) throw new NotFoundError('Project');
  return project;
}

export async function updateMilestone(
  projectId: string,
  milestoneId: string,
  data: Partial<IMilestone>,
  organizationId?: string
): Promise<IProject> {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    update[`milestones.$.${key}`] = value;
  }

  const filter: Record<string, unknown> = { _id: projectId, 'milestones._id': milestoneId };
  if (organizationId) filter.organizationId = organizationId;

  const project = await Project.findOneAndUpdate(filter, { $set: update }, { new: true });
  if (!project) throw new NotFoundError('Project or milestone');

  const milestone = project.milestones.find(m => m._id.toString() === milestoneId);
  if (milestone?.status === 'COMPLETED') {
    await emitAutomationEvent('milestone.completed', {
      projectId,
      milestoneId,
      milestone,
      organizationId,
    });
  }

  return project;
}

export async function getProjectActivity(projectId: string, limit = 20, organizationId?: string) {
  const { AuditLog } = await import('../../models/AuditLog');
  const filter: Record<string, unknown> = { resource: 'project', resourceId: projectId };
  if (organizationId) filter.organizationId = organizationId;

  return AuditLog.find(filter)
    .populate('userId', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

export async function computeHealthScore(projectId: string, organizationId?: string): Promise<number> {
  const filter: Record<string, unknown> = { _id: projectId };
  if (organizationId) filter.organizationId = organizationId;

  const project = await Project.findOne(filter);
  if (!project) return 0;

  let score = 100;
  const now = new Date();

  const overdueMilestones = project.milestones.filter(
    m => m.status !== 'COMPLETED' && m.dueDate < now
  );
  score -= overdueMilestones.length * 15;

  const taskFilter: Record<string, unknown> = {
    projectId,
    status: { $nin: ['DONE'] },
    dueDate: { $lt: now },
  };
  if (organizationId) taskFilter.organizationId = organizationId;

  const overdueTasks = await Task.countDocuments(taskFilter);
  score -= overdueTasks * 5;

  if (project.endDate && project.endDate < now && project.status !== 'COMPLETED') {
    score -= 20;
  }

  const finalScore = Math.max(0, Math.min(100, score));
  await Project.findOneAndUpdate(filter, { healthScore: finalScore });
  return finalScore;
}
