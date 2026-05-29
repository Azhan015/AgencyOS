import mongoose, { Document, Schema } from 'mongoose';

export type TriggerEvent =
  | 'project.status_changed'
  | 'invoice.overdue'
  | 'invoice.paid'
  | 'milestone.completed'
  | 'file.uploaded'
  | 'approval.given'
  | 'approval.rejected'
  | 'contract.signed'
  | 'task.assigned'
  | 'client.activated';

export type ActionType = 'SEND_NOTIFICATION' | 'CREATE_TASK' | 'SEND_INVOICE' | 'CALL_WEBHOOK' | 'CHANGE_STATUS' | 'SEND_EMAIL';
export type ConditionOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'not_contains';

export interface ICondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface IAction {
  type: ActionType;
  params: Record<string, unknown>;
}

export interface IAutomationRule extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  isActive: boolean;
  trigger: {
    event: TriggerEvent;
    conditions: ICondition[];
  };
  actions: IAction[];
  lastRunAt?: Date;
  runCount: number;
  errorCount: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ConditionSchema = new Schema<ICondition>({
  field: { type: String, required: true },
  operator: {
    type: String,
    enum: ['eq', 'neq', 'gt', 'lt', 'contains', 'not_contains'],
    required: true,
  },
  value: { type: Schema.Types.Mixed, required: true },
}, { _id: false });

const ActionSchema = new Schema<IAction>({
  type: {
    type: String,
    enum: ['SEND_NOTIFICATION', 'CREATE_TASK', 'SEND_INVOICE', 'CALL_WEBHOOK', 'CHANGE_STATUS', 'SEND_EMAIL'],
    required: true,
  },
  params: { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

const AutomationRuleSchema = new Schema<IAutomationRule>({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  name: { type: String, required: true },
  description: String,
  isActive: { type: Boolean, default: true },
  trigger: {
    event: {
      type: String,
      enum: [
        'project.status_changed', 'invoice.overdue', 'invoice.paid',
        'milestone.completed', 'file.uploaded', 'approval.given',
        'approval.rejected', 'contract.signed', 'task.assigned', 'client.activated',
      ],
      required: true,
    },
    conditions: [ConditionSchema],
  },
  actions: [ActionSchema],
  lastRunAt: Date,
  runCount: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

AutomationRuleSchema.index({ organizationId: 1, isActive: 1, 'trigger.event': 1 });
AutomationRuleSchema.index({ isActive: 1, 'trigger.event': 1 });

export const AutomationRule = mongoose.model<IAutomationRule>('AutomationRule', AutomationRuleSchema);
