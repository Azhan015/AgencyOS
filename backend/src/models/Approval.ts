import mongoose, { Document, Schema } from 'mongoose';

export type ApprovalStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED';

export interface IRevision {
  note: string;
  fileIds: mongoose.Types.ObjectId[];
  requestedAt: Date;
  resolvedAt?: Date;
}

export interface IApproval extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  milestoneId?: mongoose.Types.ObjectId;
  fileIds: mongoose.Types.ObjectId[];
  submittedBy: mongoose.Types.ObjectId;
  status: ApprovalStatus;
  submissionNote?: string;
  dueDate?: Date;
  revisions: IRevision[];
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectionReason?: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

const RevisionSchema = new Schema<IRevision>({
  note: { type: String, required: true },
  fileIds: [{ type: Schema.Types.ObjectId, ref: 'File' }],
  requestedAt: { type: Date, default: Date.now },
  resolvedAt: Date,
}, { _id: false });

const ApprovalSchema = new Schema<IApproval>({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  milestoneId: { type: Schema.Types.ObjectId },
  fileIds: [{ type: Schema.Types.ObjectId, ref: 'File' }],
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED'],
    default: 'PENDING',
  },
  submissionNote: String,
  dueDate: Date,
  revisions: [RevisionSchema],
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectionReason: String,
  title: { type: String, required: true },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

ApprovalSchema.index({ organizationId: 1, projectId: 1, status: 1 });
ApprovalSchema.index({ projectId: 1, status: 1 });
ApprovalSchema.index({ submittedBy: 1 });

export const Approval = mongoose.model<IApproval>('Approval', ApprovalSchema);
