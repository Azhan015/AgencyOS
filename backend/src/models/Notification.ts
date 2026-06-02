import mongoose, { Document, Schema } from 'mongoose';

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'FILE_UPLOADED'
  | 'INVOICE_DUE'
  | 'INVOICE_PAID'
  | 'MESSAGE_RECEIVED'
  | 'APPROVAL_NEEDED'
  | 'APPROVAL_UPDATED'
  | 'CONTRACT_SIGNED'
  | 'CONTRACT_SENT'
  | 'PROJECT_STATUS_CHANGED'
  | 'MILESTONE_COMPLETED'
  | 'MENTION'
  | 'SYSTEM';

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  isRead: boolean;
  readAt?: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: [
      'TASK_ASSIGNED', 'FILE_UPLOADED', 'INVOICE_DUE', 'INVOICE_PAID',
      'MESSAGE_RECEIVED', 'APPROVAL_NEEDED', 'APPROVAL_UPDATED',
      'CONTRACT_SIGNED', 'CONTRACT_SENT', 'PROJECT_STATUS_CHANGED',
      'MILESTONE_COMPLETED', 'MENTION', 'SYSTEM',
    ],
    required: true,
  },
  title: { type: String, required: true },
  body: { type: String, required: true },
  link: String,
  isRead: { type: Boolean, default: false },
  readAt: Date,
  metadata: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// TTL index: auto-delete after 90 days (org-scoped)
NotificationSchema.index({ organizationId: 1, createdAt: 1 }, { expireAfterSeconds: 7776000 });
NotificationSchema.index({ organizationId: 1, userId: 1, isRead: 1 });
// Legacy indexes kept for backward compatibility
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
