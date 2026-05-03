import mongoose, { Document, Schema } from 'mongoose';

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID';
export type PaymentGateway = 'STRIPE' | 'RAZORPAY' | 'MANUAL';

export interface ILineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface IInvoice extends Document {
  _id: mongoose.Types.ObjectId;
  invoiceNumber: string;
  clientId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  milestoneId?: mongoose.Types.ObjectId;
  status: InvoiceStatus;
  lineItems: ILineItem[];
  subtotal: number;
  tax: number;
  taxRate: number;
  discount: number;
  total: number;
  currency: string;
  dueDate: Date;
  issuedAt?: Date;
  viewedAt?: Date;
  paidAt?: Date;
  paymentGateway?: PaymentGateway;
  paymentIntentId?: string;
  checkoutSessionId?: string;
  receiptUrl?: string;
  pdfKey?: string;
  remindersSent: Date[];
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LineItemSchema = new Schema<ILineItem>({
  description: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  unitPrice: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const InvoiceSchema = new Schema<IInvoice>({
  invoiceNumber: { type: String, required: true, unique: true, index: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
  milestoneId: { type: Schema.Types.ObjectId },
  status: {
    type: String,
    enum: ['DRAFT', 'SENT', 'VIEWED', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID'],
    default: 'DRAFT',
  },
  lineItems: [LineItemSchema],
  subtotal: { type: Number, required: true, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  taxRate: { type: Number, default: 0, min: 0, max: 100 },
  discount: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD' },
  dueDate: { type: Date, required: true },
  issuedAt: Date,
  viewedAt: Date,
  paidAt: Date,
  paymentGateway: {
    type: String,
    enum: ['STRIPE', 'RAZORPAY', 'MANUAL'],
  },
  paymentIntentId: String,
  checkoutSessionId: String,
  receiptUrl: String,
  pdfKey: String,
  remindersSent: [Date],
  notes: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

InvoiceSchema.index({ clientId: 1, status: 1 });
InvoiceSchema.index({ projectId: 1 });
InvoiceSchema.index({ dueDate: 1, status: 1 });
InvoiceSchema.index({ paymentIntentId: 1 }, { sparse: true });

export const Invoice = mongoose.model<IInvoice>('Invoice', InvoiceSchema);
