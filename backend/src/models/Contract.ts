import mongoose, { Document, Schema } from 'mongoose';

export type ContractType = 'NDA' | 'SOW' | 'RETAINER' | 'CHANGE_ORDER';
export type ContractStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'SIGNED' | 'EXECUTED' | 'EXPIRED';

export interface ISignature {
  svg?: string;
  signedAt?: Date;
  ipAddress?: string;
  userAgent?: string;
  hash?: string;
  signerName?: string;
}

export interface IContract extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  templateId?: mongoose.Types.ObjectId;
  type: ContractType;
  status: ContractStatus;
  title: string;
  content: string;
  variables: Record<string, unknown>;
  clientSignature?: ISignature;
  agencySignature?: ISignature;
  expiresAt?: Date;
  pdfKey?: string;
  sentAt?: Date;
  viewedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SignatureSchema = new Schema<ISignature>({
  svg: String,
  signedAt: Date,
  ipAddress: String,
  userAgent: String,
  hash: String,
  signerName: String,
}, { _id: false });

const ContractSchema = new Schema<IContract>({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
  templateId: { type: Schema.Types.ObjectId, ref: 'ContractTemplate' },
  type: {
    type: String,
    enum: ['NDA', 'SOW', 'RETAINER', 'CHANGE_ORDER'],
    required: true,
  },
  status: {
    type: String,
    enum: ['DRAFT', 'SENT', 'VIEWED', 'SIGNED', 'EXECUTED', 'EXPIRED'],
    default: 'DRAFT',
  },
  title: { type: String, required: true },
  content: { type: String, required: true },
  variables: { type: Schema.Types.Mixed, default: {} },
  clientSignature: SignatureSchema,
  agencySignature: SignatureSchema,
  expiresAt: Date,
  pdfKey: String,
  sentAt: Date,
  viewedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

ContractSchema.index({ organizationId: 1, status: 1 });
ContractSchema.index({ organizationId: 1, clientId: 1 });
ContractSchema.index({ clientId: 1, status: 1 });
ContractSchema.index({ projectId: 1 });

export const Contract = mongoose.model<IContract>('Contract', ContractSchema);
