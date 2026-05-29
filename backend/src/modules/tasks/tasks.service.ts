import { Task, ITask } from '../../models/Task';
import { NotFoundError } from '../../lib/errors';
import { createNotification } from '../notifications/notifications.service';
import { emitAutomationEvent } from '../automations/automations.service';

export async function listTasks(query: {
  projectId?: string;
  assigneeId?: string;
  status?: string;
  priority?: string;
  milestoneId?: string;
  organizationId?: string;
}) {
  const { projectId, assigneeId, status, priority, milestoneId, organizationId } = query;

  // organizationId is always first
  const filter: Record<string, unknown> = {};
  if (organizationId) filter.organizationId = organizationId;
  if (projectId) filter.projectId = projectId;
  if (assigneeId) filter.assignees = assigneeId;
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (milestoneId) filter.milestoneId = milestoneId;

  return Task.find(filter)
    .populate('assignees', 'name email avatar')
    .populate('createdBy', 'name email avatar')
    .populate('completedBy', 'name email avatar')
    .sort({ order: 1, createdAt: -1 })
    .lean();
}

export async function getTask(id: string, organizationId?: string): Promise<ITask> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const task = await Task.findOne(filter)
    .populate('assignees', 'name email avatar')
    .populate('createdBy', 'name email avatar')
    .populate('completedBy', 'name email avatar');
  if (!task) throw new NotFoundError('Task');
  return task;
}

export async function createTask(data: {
  projectId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assignees?: string[];
  dueDate?: Date;
  milestoneId?: string;
  dependencies?: string[];
  tags?: string[];
  order?: number;
  createdBy: string;
  organizationId?: string;
}): Promise<ITask> {
  const task = await Task.create(data);

  // Notify assignees
  if (data.assignees?.length) {
    for (const assigneeId of data.assignees) {
      if (assigneeId !== data.createdBy) {
        await createNotification({
          userId: assigneeId,
          type: 'TASK_ASSIGNED',
          title: 'New task assigned',
          body: `You've been assigned: "${data.title}"`,
          link: `/projects/${data.projectId}?tab=tasks`,
          metadata: { taskId: task._id.toString(), projectId: data.projectId },
          organizationId: data.organizationId,
        });
      }
    }

    await emitAutomationEvent('task.assigned', {
      taskId: task._id.toString(),
      projectId: data.projectId,
      assignees: data.assignees,
      organizationId: data.organizationId,
    });
  }

  return task;
}

export async function updateTask(
  id: string,
  data: Partial<ITask>,
  actingUserId?: string,
  organizationId?: string
): Promise<ITask> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const isDone = data.status === 'DONE';
  const current = await Task.findOne(filter).select('status').lean();
  const wasNotDone = current?.status !== 'DONE';

  const task = await Task.findOneAndUpdate(
    filter,
    {
      $set: {
        ...data,
        ...(isDone && wasNotDone
          ? { completedAt: new Date(), completedBy: actingUserId ?? null }
          : {}),
        ...(!isDone && data.status
          ? { completedAt: null, completedBy: null }
          : {}),
      },
    },
    { new: true, runValidators: true }
  )
    .populate('assignees', 'name email avatar')
    .populate('createdBy', 'name email avatar')
    .populate('completedBy', 'name email avatar');

  if (!task) throw new NotFoundError('Task');
  return task;
}

export async function deleteTask(id: string, organizationId?: string): Promise<void> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const task = await Task.findOneAndDelete(filter);
  if (!task) throw new NotFoundError('Task');
}

export async function reorderTasks(
  tasks: Array<{ id: string; order: number; status: string }>,
  organizationId?: string
): Promise<void> {
  const mongoose = await import('mongoose');
  const ops = tasks.map(t => ({
    updateOne: {
      filter: {
        _id: new mongoose.Types.ObjectId(t.id),
        ...(organizationId ? { organizationId } : {}),
      },
      update: { $set: { order: t.order, status: t.status } },
    },
  }));
  await Task.bulkWrite(ops as Parameters<typeof Task.bulkWrite>[0]);
}
