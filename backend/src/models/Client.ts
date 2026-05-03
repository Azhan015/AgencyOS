import mongoose, { Document, Schema, Model } from 'mongoose';

export type ClientTier = 'STARTER' | 'GROWTH' | 'ENTERPRISE';
export type ClientStatus = 'INVITED' | 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED';

export interface IClient extends Document {
  _id: mongoose.Types.ObjectId;
  slug: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  website?: string;
  tier: ClientTier;
  status: ClientStatus;
  assignedPM?: mongoose.Types.ObjectId;
  storageUsedBytes: number;
  storageLimitBytes: number;
  stripeCustomerId?: string;
  onboardingCompletedAt?: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IClientModel extends Model<IClient> {
  findBySlug(slug: string): Promise<IClient | null>;
}

const ClientSchema = new Schema<IClient, IClientModel>({
  slug: { type: String, required: true, unique: true, index: true },
  companyName: { type: String, required: true, trim: true },
  contactName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  phone: String,
  website: String,
  tier: {
    type: String,
    enum: ['STARTER', 'GROWTH', 'ENTERPRISE'],
    default: 'STARTER',
  },
  status: {
    type: String,
    enum: ['INVITED', 'ONBOARDING', 'ACTIVE', 'SUSPENDED'],
    default: 'INVITED',
  },
  assignedPM: { type: Schema.Types.ObjectId, ref: 'User' },
  storageUsedBytes: { type: Number, default: 0 },
  storageLimitBytes: {
    type: Number,
    default: function(this: IClient) {
      const limits: Record<ClientTier, number> = {
        STARTER: 5 * 1024 * 1024 * 1024,    // 5GB
        GROWTH: 50 * 1024 * 1024 * 1024,    // 50GB
        ENTERPRISE: 500 * 1024 * 1024 * 1024, // 500GB
      };
      return limits[this.tier] || limits.STARTER;
    },
  },
  stripeCustomerId: { type: String, sparse: true },
  onboardingCompletedAt: Date,
  metadata: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

ClientSchema.index({ email: 1 });
ClientSchema.index({ status: 1 });
ClientSchema.index({ assignedPM: 1 });

ClientSchema.statics.findBySlug = function(slug: string): Promise<IClient | null> {
  return this.findOne({ slug });
};

export const Client = mongoose.model<IClient, IClientModel>('Client', ClientSchema);
