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
}) {
  const filter: Record<string, unknown> = {};
  if (query.projectId) filter.projectId = query.projectId;
  if (query.assigneeId) filter.assignees = query.assigneeId;
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.milestoneId) filter.milestoneId = query.milestoneId;

  return Task.find(filter)
    .populate('assignees', 'name email avatar')
    .populate('createdBy', 'name email avatar')
    .populate('completedBy', 'name email avatar')
    .sort({ order: 1, createdAt: -1 })
    .lean();
}

export async function getTask(id: string): Promise<ITask> {
  const task = await Task.findById(id)
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
        });
      }
    }

    await emitAutomationEvent('task.assigned', {
      taskId: task._id.toString(),
      projectId: data.projectId,
      assignees: data.assignees,
    });
  }

  return task;
}

export async function updateTask(id: string, data: Partial<ITask>, actingUserId?: string): Promise<ITask> {
  const isDone = data.status === 'DONE';
  const wasNotDone = (await Task.findById(id).select('status').lean())?.status !== 'DONE';

  const task = await Task.findByIdAndUpdate(
    id,
    {
      $set: {
        ...data,
        // Record completion timestamp and who completed it
        ...(isDone && wasNotDone
          ? { completedAt: new Date(), completedBy: actingUserId ?? null }
          : {}),
        // Clear completion info if moved back out of DONE
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

export async function deleteTask(id: string): Promise<void> {
  const task = await Task.findByIdAndDelete(id);
  if (!task) throw new NotFoundError('Task');
}

export async function reorderTasks(tasks: Array<{ id: string; order: number; status: string }>): Promise<void> {
  const mongoose = await import('mongoose');
  const ops = tasks.map(t => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(t.id) },
      update: { $set: { order: t.order, status: t.status } },
    },
  }));
  await Task.bulkWrite(ops as Parameters<typeof Task.bulkWrite>[0]);
}
