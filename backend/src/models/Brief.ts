import mongoose, { Document, Schema } from 'mongoose';

export interface IBriefQuestion {
  question: string;
  answer: string;
  type: 'text' | 'textarea' | 'select' | 'multiselect';
}

export interface IBrief extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  title: string;
  questions: IBriefQuestion[];
  completedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BriefQuestionSchema = new Schema<IBriefQuestion>({
  question: { type: String, required: true },
  answer: { type: String, default: '' },
  type: {
    type: String,
    enum: ['text', 'textarea', 'select', 'multiselect'],
    default: 'text',
  },
}, { _id: false });

const BriefSchema = new Schema<IBrief>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
  title: { type: String, required: true },
  questions: [BriefQuestionSchema],
  completedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export const Brief = mongoose.model<IBrief>('Brief', BriefSchema);
