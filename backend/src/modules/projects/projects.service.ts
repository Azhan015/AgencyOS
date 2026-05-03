import mongoose from 'mongoose';
import { Project, IProject, IMilestone } from '../../models/Project';
import { Task } from '../../models/Task';
import { Channel } from '../../models/Channel';
import { generateSlug } from '../../lib/crypto';
import { cacheDel, cacheGet, cacheSet } from '../../config/redis';
import { NotFoundError, AuthorizationError } from '../../lib/errors';
import { emitAutomationEvent } from '../automations/automations.service';
import { createNotification } from '../notifications/notifications.service';

export async function listProjects(query: {
  userId: string;
  userRole: string;
  clientId?: string;
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
}) {
  const { userId, userRole, clientId, status, page = 1, limit = 20, search } = query;
  const filter: Record<string, unknown> = {};

  // Scope by role
  if (userRole === 'CLIENT') {
    filter.clientId = clientId;
  } else if (userRole === 'PROJECT_MANAGER') {
    filter.$or = [{ pm: userId }, { contributors: userId }];
  } else if (userRole === 'CONTRIBUTOR') {
    filter.contributors = userId;
  }
  // ADMIN/SUPERADMIN see all

  if (clientId && userRole !== 'CLIENT') filter.clientId = clientId;
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

export async function getProject(id: string, userId: string, userRole: string, clientId?: string): Promise<IProject> {
  const project = await Project.findById(id)
    .populate('pm', 'name email avatar')
    .populate('contributors', 'name email avatar')
    .populate('clientId', 'companyName slug email contactName')
    .populate('brief');

  if (!project) throw new NotFoundError('Project');

  // Access control
  if (userRole === 'CLIENT' && (project.clientId as unknown as { _id: { toString(): string } })?._id?.toString() !== clientId) {
    throw new AuthorizationError();
  }
  if (userRole === 'CONTRIBUTOR') {
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
}): Promise<IProject> {
  const slug = generateSlug(data.name);

  const project = await Project.create({
    ...data,
    slug,
    status: 'SCOPING',
  });

  // Create default project channel
  await Channel.create({
    projectId: project._id,
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
  });

  return project;
}

export async function updateProject(id: string, data: Partial<IProject>, userId: string, userRole: string): Promise<IProject> {
  const project = await Project.findById(id);
  if (!project) throw new NotFoundError('Project');

  const oldStatus = project.status;

  const updated = await Project.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, runValidators: true }
  ).populate('pm contributors clientId');

  if (!updated) throw new NotFoundError('Project');

  await cacheDel(`project:${id}`);

  // Trigger automation if status changed
  if (data.status && data.status !== oldStatus) {
    await emitAutomationEvent('project.status_changed', {
      projectId: id,
      oldStatus,
      newStatus: data.status,
      project: updated.toObject(),
    });
  }

  return updated;
}

export async function updateProjectStatus(id: string, status: string, userId: string, userRole: string): Promise<IProject> {
  return updateProject(id, { status: status as IProject['status'] }, userId, userRole);
}

export async function addMilestone(projectId: string, data: {
  name: string;
  dueDate: Date;
  invoiceAmount?: number;
  triggerInvoice?: boolean;
  order?: number;
}): Promise<IProject> {
  const project = await Project.findByIdAndUpdate(
    projectId,
    { $push: { milestones: { ...data, status: 'PENDING', _id: new mongoose.Types.ObjectId() } } },
    { new: true }
  );
  if (!project) throw new NotFoundError('Project');
  return project;
}

export async function updateMilestone(projectId: string, milestoneId: string, data: Partial<IMilestone>): Promise<IProject> {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    update[`milestones.$.${key}`] = value;
  }

  const project = await Project.findOneAndUpdate(
    { _id: projectId, 'milestones._id': milestoneId },
    { $set: update },
    { new: true }
  );
  if (!project) throw new NotFoundError('Project or milestone');

  // Check if milestone completed
  const milestone = project.milestones.find(m => m._id.toString() === milestoneId);
  if (milestone?.status === 'COMPLETED') {
    await emitAutomationEvent('milestone.completed', {
      projectId,
      milestoneId,
      milestone: milestone,
    });
  }

  return project;
}

export async function getProjectActivity(projectId: string, limit = 20) {
  const { AuditLog } = await import('../../models/AuditLog');
  return AuditLog.find({ resource: 'project', resourceId: projectId })
    .populate('userId', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

export async function computeHealthScore(projectId: string): Promise<number> {
  const project = await Project.findById(projectId);
  if (!project) return 0;

  let score = 100;
  const now = new Date();

  // Deduct for overdue milestones
  const overdueMilestones = project.milestones.filter(
    m => m.status !== 'COMPLETED' && m.dueDate < now
  );
  score -= overdueMilestones.length * 15;

  // Deduct for overdue tasks
  const overdueTasks = await Task.countDocuments({
    projectId,
    status: { $nin: ['DONE'] },
    dueDate: { $lt: now },
  });
  score -= overdueTasks * 5;

  // Deduct if project end date passed
  if (project.endDate && project.endDate < now && project.status !== 'COMPLETED') {
    score -= 20;
  }

  const finalScore = Math.max(0, Math.min(100, score));
  await Project.findByIdAndUpdate(projectId, { healthScore: finalScore });
  return finalScore;
}
