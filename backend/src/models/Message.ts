import mongoose, { Document, Schema } from 'mongoose';

export type MessageContentType = 'TEXT' | 'FILE' | 'SYSTEM';

export interface IReadReceipt {
  userId: mongoose.Types.ObjectId;
  readAt: Date;
}

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  channelId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content: string;
  contentType: MessageContentType;
  attachments: mongoose.Types.ObjectId[];
  mentions: mongoose.Types.ObjectId[];
  isPinned: boolean;
  readBy: IReadReceipt[];
  editedAt?: Date;
  deletedAt?: Date;
  replyTo?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ReadReceiptSchema = new Schema<IReadReceipt>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  readAt: { type: Date, default: Date.now },
}, { _id: false });

const MessageSchema = new Schema<IMessage>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  channelId: { type: Schema.Types.ObjectId, required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, maxlength: 10000 },
  contentType: {
    type: String,
    enum: ['TEXT', 'FILE', 'SYSTEM'],
    default: 'TEXT',
  },
  attachments: [{ type: Schema.Types.ObjectId, ref: 'File' }],
  mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  isPinned: { type: Boolean, default: false },
  readBy: [ReadReceiptSchema],
  editedAt: Date,
  deletedAt: Date,
  replyTo: { type: Schema.Types.ObjectId, ref: 'Message' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

MessageSchema.index({ projectId: 1, createdAt: -1 });
MessageSchema.index({ channelId: 1, createdAt: -1 });
MessageSchema.index({ content: 'text' });
MessageSchema.index({ deletedAt: 1 }, { sparse: true });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
