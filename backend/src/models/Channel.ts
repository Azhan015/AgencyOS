import mongoose, { Document, Schema } from 'mongoose';

export type ChannelType = 'PROJECT' | 'DIRECT' | 'ANNOUNCEMENT';

export interface IChannel extends Document {
  _id: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  name: string;
  type: ChannelType;
  members: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  isArchived: boolean;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChannelSchema = new Schema<IChannel>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['PROJECT', 'DIRECT', 'ANNOUNCEMENT'],
    default: 'PROJECT',
  },
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  isArchived: { type: Boolean, default: false },
  lastMessageAt: Date,
}, {
  timestamps: true,
});

ChannelSchema.index({ projectId: 1 });
ChannelSchema.index({ members: 1 });

export const Channel = mongoose.model<IChannel>('Channel', ChannelSchema);
