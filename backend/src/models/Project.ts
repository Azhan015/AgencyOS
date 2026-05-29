import mongoose, { Document, Schema, Model } from 'mongoose';

export type ProjectStatus = 'SCOPING' | 'ACTIVE' | 'REVIEW' | 'COMPLETED' | 'ARCHIVED';
export type ProjectType = 'WEBSITE' | 'BRANDING' | 'CAMPAIGN' | 'CUSTOM';
export type MilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface IMilestone {
  _id: mongoose.Types.ObjectId;
  name: string;
  dueDate: Date;
  status: MilestoneStatus;
  invoiceAmount: number;
  triggerInvoice: boolean;
  completedAt?: Date;
  order: number;
}

export interface IProject extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  clientId: mongoose.Types.ObjectId;
  type: ProjectType;
  status: ProjectStatus;
  pm: mongoose.Types.ObjectId;
  contributors: mongoose.Types.ObjectId[];
  budget: number;
  currency: string;
  startDate?: Date;
  endDate?: Date;
  milestones: IMilestone[];
  healthScore: number;
  brief?: mongoose.Types.ObjectId;
  tags: string[];
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneSchema = new Schema<IMilestone>({
  name: { type: String, required: true },
  dueDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED'],
    default: 'PENDING',
  },
  invoiceAmount: { type: Number, default: 0 },
  triggerInvoice: { type: Boolean, default: false },
  completedAt: Date,
  order: { type: Number, default: 0 },
});

const ProjectSchema = new Schema<IProject>({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  // slug is unique per organization (not globally)
  slug: { type: String, required: true, index: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  type: {
    type: String,
    enum: ['WEBSITE', 'BRANDING', 'CAMPAIGN', 'CUSTOM'],
    default: 'CUSTOM',
  },
  status: {
    type: String,
    enum: ['SCOPING', 'ACTIVE', 'REVIEW', 'COMPLETED', 'ARCHIVED'],
    default: 'SCOPING',
  },
  pm: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  contributors: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  budget: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  startDate: Date,
  endDate: Date,
  milestones: [MilestoneSchema],
  healthScore: { type: Number, default: 100, min: 0, max: 100 },
  brief: { type: Schema.Types.ObjectId, ref: 'Brief' },
  tags: [String],
  description: String,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

ProjectSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
ProjectSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
ProjectSchema.index({ organizationId: 1, clientId: 1 });
ProjectSchema.index({ organizationId: 1, pm: 1 });
ProjectSchema.index({ clientId: 1, status: 1 });
ProjectSchema.index({ pm: 1 });
ProjectSchema.index({ contributors: 1 });
ProjectSchema.index({ createdAt: -1 });

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
