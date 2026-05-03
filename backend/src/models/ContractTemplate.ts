import mongoose, { Document, Schema } from 'mongoose';
import { ContractType } from './Contract';

export interface IContractTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  type: ContractType;
  content: string;
  variables: string[];
  isDefault: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ContractTemplateSchema = new Schema<IContractTemplate>({
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['NDA', 'SOW', 'RETAINER', 'CHANGE_ORDER'],
    required: true,
  },
  content: { type: String, required: true },
  variables: [String],
  isDefault: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export const ContractTemplate = mongoose.model<IContractTemplate>('ContractTemplate', ContractTemplateSchema);
