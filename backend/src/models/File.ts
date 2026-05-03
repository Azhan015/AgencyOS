import mongoose, { Document, Schema } from 'mongoose';

export type ScanStatus = 'PENDING' | 'CLEAN' | 'INFECTED' | 'FAILED';

export interface IAnnotation {
  _id: mongoose.Types.ObjectId;
  x: number;
  y: number;
  pageNum: number;
  comment: string;
  authorId: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface IFile extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  uploadedBy: mongoose.Types.ObjectId;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  folder: string;
  version: number;
  parentFileId?: mongoose.Types.ObjectId;
  isClientVisible: boolean;
  scanStatus: ScanStatus;
  annotations: IAnnotation[];
  downloadCount: number;
  thumbnailKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AnnotationSchema = new Schema<IAnnotation>({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  pageNum: { type: Number, default: 1 },
  comment: { type: String, required: true },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  resolvedAt: Date,
  createdAt: { type: Date, default: Date.now },
});

const FileSchema = new Schema<IFile>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  storageKey: { type: String, required: true },
  folder: { type: String, default: '/' },
  version: { type: Number, default: 1 },
  parentFileId: { type: Schema.Types.ObjectId, ref: 'File' },
  isClientVisible: { type: Boolean, default: false },
  scanStatus: {
    type: String,
    enum: ['PENDING', 'CLEAN', 'INFECTED', 'FAILED'],
    default: 'PENDING',
  },
  annotations: [AnnotationSchema],
  downloadCount: { type: Number, default: 0 },
  thumbnailKey: String,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

FileSchema.index({ projectId: 1, folder: 1 });
FileSchema.index({ clientId: 1 });
FileSchema.index({ parentFileId: 1 });
FileSchema.index({ scanStatus: 1 });

export const File = mongoose.model<IFile>('File', FileSchema);
