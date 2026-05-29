import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  isPlatformAction: boolean;
  userId: mongoose.Types.ObjectId;
  action: string;
  resource: string;
  resourceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  // organizationId is optional — null means platform-level audit action
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    index: true,
    sparse: true,
  },
  isPlatformAction: { type: Boolean, default: false },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true },
  resource: { type: String, required: true },
  resourceId: String,
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  ip: String,
  userAgent: String,
  metadata: Schema.Types.Mixed,
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

AuditLogSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, resource: 1, resourceId: 1 });
AuditLogSchema.index({ isPlatformAction: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
