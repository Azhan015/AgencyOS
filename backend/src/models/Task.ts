import mongoose, { Document, Schema } from 'mongoose';

export type TaskStatus = 'BACKLOG' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface ITask extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  milestoneId?: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignees: mongoose.Types.ObjectId[];
  dueDate?: Date;
  completedAt?: Date;
  dependencies: mongoose.Types.ObjectId[];
  tags: string[];
  order: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  milestoneId: { type: Schema.Types.ObjectId },
  title: { type: String, required: true, trim: true },
  description: String,
  status: {
    type: String,
    enum: ['BACKLOG', 'IN_PROGRESS', 'REVIEW', 'DONE'],
    default: 'BACKLOG',
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM',
  },
  assignees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  dueDate: Date,
  completedAt: Date,
  dependencies: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
  tags: [String],
  order: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

TaskSchema.index({ projectId: 1, status: 1 });
TaskSchema.index({ assignees: 1 });

export const Task = mongoose.model<ITask>('Task', TaskSchema);
