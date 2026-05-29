import { AutomationRule, IAutomationRule, TriggerEvent } from '../../models/AutomationRule';
import { NotFoundError } from '../../lib/errors';
import { logger } from '../../lib/logger';

export async function listRules(query: { page?: number; limit?: number; isActive?: boolean; organizationId?: string }) {
  const { page = 1, limit = 20, isActive, organizationId } = query;
  const filter: Record<string, unknown> = {};
  if (organizationId) filter.organizationId = organizationId;
  if (isActive !== undefined) filter.isActive = isActive;

  const [rules, total] = await Promise.all([
    AutomationRule.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AutomationRule.countDocuments(filter),
  ]);

  return { rules, total, page, limit };
}

export async function getRule(id: string, organizationId?: string): Promise<IAutomationRule> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;
  const rule = await AutomationRule.findOne(filter);
  if (!rule) throw new NotFoundError('Automation rule');
  return rule;
}

export async function createRule(data: {
  name: string;
  description?: string;
  trigger: { event: TriggerEvent; conditions: Array<{ field: string; operator: string; value: unknown }> };
  actions: Array<{ type: string; params: Record<string, unknown> }>;
  createdBy: string;
  organizationId?: string;
}): Promise<IAutomationRule> {
  return AutomationRule.create({ ...data, isActive: true });
}

export async function updateRule(id: string, data: Partial<IAutomationRule>, organizationId?: string): Promise<IAutomationRule> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;
  const rule = await AutomationRule.findOneAndUpdate(filter, { $set: data }, { new: true });
  if (!rule) throw new NotFoundError('Automation rule');
  return rule;
}

export async function deleteRule(id: string, organizationId?: string): Promise<void> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;
  const rule = await AutomationRule.findOneAndDelete(filter);
  if (!rule) throw new NotFoundError('Automation rule');
}

export async function emitAutomationEvent(event: TriggerEvent, context: Record<string, unknown>): Promise<void> {
  try {
    // Scope automation rules to the organization if context provides it
    const filter: Record<string, unknown> = {
      isActive: true,
      'trigger.event': event,
    };
    if (context.organizationId) filter.organizationId = context.organizationId;

    const rules = await AutomationRule.find(filter);

    for (const rule of rules) {
      try {
        const conditionsMet = evaluateConditions(rule.trigger.conditions, context);
        if (!conditionsMet) continue;

        await executeActions(rule.actions, context);

        await AutomationRule.findByIdAndUpdate(rule._id, {
          $inc: { runCount: 1 },
          lastRunAt: new Date(),
        });
      } catch (err) {
        logger.error({ err, ruleId: rule._id, event }, 'Automation rule execution failed');
        await AutomationRule.findByIdAndUpdate(rule._id, {
          $inc: { errorCount: 1 },
        });
      }
    }
  } catch (err) {
    logger.error({ err, event }, 'Failed to process automation event');
  }
}

function evaluateConditions(
  conditions: Array<{ field: string; operator: string; value: unknown }>,
  context: Record<string, unknown>
): boolean {
  if (!conditions.length) return true;

  return conditions.every(condition => {
    const contextValue = getNestedValue(context, condition.field);

    switch (condition.operator) {
      case 'eq': return contextValue === condition.value;
      case 'neq': return contextValue !== condition.value;
      case 'gt': return Number(contextValue) > Number(condition.value);
      case 'lt': return Number(contextValue) < Number(condition.value);
      case 'contains': return String(contextValue).includes(String(condition.value));
      case 'not_contains': return !String(contextValue).includes(String(condition.value));
      default: return false;
    }
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

async function executeActions(
  actions: Array<{ type: string; params: Record<string, unknown> }>,
  context: Record<string, unknown>
): Promise<void> {
  for (const action of actions) {
    try {
      switch (action.type) {
        case 'SEND_NOTIFICATION': {
          const { createNotification } = await import('../notifications/notifications.service');
          if (action.params.userId) {
            await createNotification({
              userId: String(action.params.userId),
              type: (action.params.notificationType as string || 'SYSTEM') as import('../../models/Notification').NotificationType,
              title: String(action.params.title || 'Automation notification'),
              body: String(action.params.body || ''),
              link: action.params.link ? String(action.params.link) : undefined,
              metadata: { context, automated: true },
            });
          }
          break;
        }

        case 'SEND_EMAIL': {
          const { sendEmail } = await import('../../lib/email');
          if (action.params.to) {
            await sendEmail({
              to: String(action.params.to),
              subject: String(action.params.subject || 'Automated notification'),
              html: String(action.params.html || action.params.body || ''),
            });
          }
          break;
        }

        case 'CALL_WEBHOOK': {
          if (action.params.url) {
            const axios = (await import('axios')).default;
            await axios.post(String(action.params.url), {
              event: context,
              timestamp: new Date().toISOString(),
            }, {
              timeout: 10000,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          break;
        }

        case 'CREATE_TASK': {
          if (action.params.projectId) {
            const { Task } = await import('../../models/Task');
            await Task.create({
              projectId: action.params.projectId,
              organizationId: action.params.organizationId || context.organizationId,
              title: String(action.params.title || 'Automated task'),
              description: action.params.description ? String(action.params.description) : undefined,
              priority: action.params.priority || 'MEDIUM',
              status: 'BACKLOG',
              createdBy: action.params.createdBy || context.userId,
            });
          }
          break;
        }

        case 'CHANGE_STATUS': {
          // Changes the status of a project or task
          // params: { resourceType: 'project'|'task', resourceId, newStatus }
          const resourceType = String(action.params.resourceType || '');
          const resourceId   = String(action.params.resourceId || context.projectId || context.taskId || '');
          const newStatus    = String(action.params.newStatus || '');
          const orgId        = String(action.params.organizationId || context.organizationId || '');

          if (!resourceId || !newStatus) {
            logger.warn({ action }, 'CHANGE_STATUS missing resourceId or newStatus');
            break;
          }

          if (resourceType === 'project' || context.projectId) {
            const { Project } = await import('../../models/Project');
            const filter: Record<string, unknown> = { _id: resourceId };
            if (orgId) filter.organizationId = orgId;
            await Project.findOneAndUpdate(filter, { status: newStatus });
            logger.info({ resourceId, newStatus, orgId }, 'Automation: project status changed');
          } else if (resourceType === 'task' || context.taskId) {
            const { Task } = await import('../../models/Task');
            const filter: Record<string, unknown> = { _id: resourceId };
            if (orgId) filter.organizationId = orgId;
            await Task.findOneAndUpdate(filter, { status: newStatus });
            logger.info({ resourceId, newStatus, orgId }, 'Automation: task status changed');
          }
          break;
        }

        case 'SEND_INVOICE': {
          // Sends a DRAFT invoice
          // params: { invoiceId } OR uses context.invoiceId
          const invoiceId = String(action.params.invoiceId || context.invoiceId || '');
          if (!invoiceId) {
            logger.warn({ action }, 'SEND_INVOICE missing invoiceId');
            break;
          }
          const { sendInvoice } = await import('../invoices/invoices.service');
          await sendInvoice(invoiceId);
          logger.info({ invoiceId }, 'Automation: invoice sent');
          break;
        }

        default:
          logger.warn({ actionType: action.type }, 'Unknown automation action type');
      }
    } catch (err) {
      logger.error({ err, actionType: action.type }, 'Automation action failed');
    }
  }
}
