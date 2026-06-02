import mongoose, { Document, Schema, Model } from 'mongoose';

export type OrgStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED_TRIAL'
  | 'ARCHIVED';

export type OrgPlan = 'TRIAL' | 'STARTER' | 'GROWTH' | 'ENTERPRISE';

export interface IOrgLimits {
  seats: number;
  storageBytes: number;
  projects: number;
  clients: number;
  automations: number;
}

export interface IOrgUsage {
  seats: number;
  storageUsedBytes: number;
  projects: number;
  clients: number;
}

export interface IOrgFeatures {
  contractModule: boolean;
  invoiceModule: boolean;
  automationsModule: boolean;
  analyticsModule: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
  customDomain: boolean;
  ssoEnabled: boolean;
}

export interface IOrgOnboarding {
  completedSteps: string[];
  currentStep: string;
  completedAt?: Date;
}

export interface IOrganization extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  domain?: string;
  logoUrl?: string;
  status: OrgStatus;
  plan: OrgPlan;

  // Lifecycle timestamps
  registeredAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  suspendedAt?: Date;
  archivedAt?: Date;
  trialStartsAt?: Date;
  trialEndsAt?: Date;
  expiresAt?: Date;

  // Approval workflow
  approvalReviewedBy?: mongoose.Types.ObjectId;
  approvalNotes?: string;
  rejectionReason?: string;
  approvalSubmittedAt?: Date;

  // Billing
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  billingEmail?: string;
  billingInterval?: 'monthly' | 'annual';
  mrr: number;

  // Plan limits
  limits: IOrgLimits;

  // Usage tracking
  usage: IOrgUsage;

  // Feature flags
  features: IOrgFeatures;

  // Onboarding
  onboarding: IOrgOnboarding;

  // Contact
  ownerEmail: string;
  contactPhone?: string;
  address?: {
    line1: string;
    city: string;
    country: string;
    postalCode: string;
  };

  // Audit
  registrationIp?: string;
  registrationUserAgent?: string;
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export interface IOrganizationModel extends Model<IOrganization> {
  getDefaultLimits(plan: OrgPlan): IOrgLimits;
}

const OrganizationSchema = new Schema<IOrganization, IOrganizationModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    domain: { type: String, sparse: true, lowercase: true },
    logoUrl: String,
    status: {
      type: String,
      enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED', 'EXPIRED_TRIAL', 'ARCHIVED'],
      default: 'PENDING_APPROVAL',
    },
    plan: {
      type: String,
      enum: ['TRIAL', 'STARTER', 'GROWTH', 'ENTERPRISE'],
      default: 'TRIAL',
    },

    registeredAt: { type: Date, default: Date.now },
    approvedAt: Date,
    rejectedAt: Date,
    suspendedAt: Date,
    archivedAt: Date,
    trialStartsAt: Date,
    trialEndsAt: Date,
    expiresAt: Date,

    approvalReviewedBy: { type: Schema.Types.ObjectId, ref: 'PlatformUser' },
    approvalNotes: String,
    rejectionReason: String,
    approvalSubmittedAt: Date,

    stripeCustomerId: { type: String, sparse: true },
    stripeSubscriptionId: { type: String, sparse: true },
    stripePriceId: String,
    billingEmail: String,
    billingInterval: { type: String, enum: ['monthly', 'annual'] },
    mrr: { type: Number, default: 0 },

    limits: {
      seats: { type: Number, default: 5 },
      storageBytes: { type: Number, default: 5 * 1024 * 1024 * 1024 }, // 5GB
      projects: { type: Number, default: 10 },
      clients: { type: Number, default: 20 },
      automations: { type: Number, default: 10 },
    },

    usage: {
      seats: { type: Number, default: 0 },
      storageUsedBytes: { type: Number, default: 0 },
      projects: { type: Number, default: 0 },
      clients: { type: Number, default: 0 },
    },

    features: {
      contractModule: { type: Boolean, default: true },
      invoiceModule: { type: Boolean, default: true },
      automationsModule: { type: Boolean, default: false },
      analyticsModule: { type: Boolean, default: true },
      apiAccess: { type: Boolean, default: false },
      whiteLabel: { type: Boolean, default: false },
      customDomain: { type: Boolean, default: false },
      ssoEnabled: { type: Boolean, default: false },
    },

    onboarding: {
      completedSteps: [String],
      currentStep: { type: String, default: 'profile' },
      completedAt: Date,
    },

    ownerEmail: { type: String, required: true, lowercase: true, trim: true },
    contactPhone: String,
    address: {
      line1: String,
      city: String,
      country: String,
      postalCode: String,
    },

    registrationIp: String,
    registrationUserAgent: String,
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
OrganizationSchema.index({ slug: 1 }, { unique: true });
OrganizationSchema.index({ status: 1 });
OrganizationSchema.index({ status: 1, plan: 1 });
OrganizationSchema.index({ trialEndsAt: 1 }, { sparse: true });
OrganizationSchema.index({ expiresAt: 1 }, { sparse: true });
OrganizationSchema.index({ stripeCustomerId: 1 }, { sparse: true });
OrganizationSchema.index({ ownerEmail: 1 });
OrganizationSchema.index({ createdAt: -1 });
OrganizationSchema.index({ 'usage.storageUsedBytes': -1 });

// ── Statics ────────────────────────────────────────────────────────────────────
OrganizationSchema.statics.getDefaultLimits = function (plan: OrgPlan): IOrgLimits {
  const limits: Record<OrgPlan, IOrgLimits> = {
    TRIAL: { seats: 3, storageBytes: 1 * 1024 ** 3, projects: 3, clients: 5, automations: 3 },
    STARTER: { seats: 10, storageBytes: 10 * 1024 ** 3, projects: 20, clients: 50, automations: 10 },
    GROWTH: { seats: 50, storageBytes: 100 * 1024 ** 3, projects: -1, clients: -1, automations: 50 },
    ENTERPRISE: { seats: -1, storageBytes: 1000 * 1024 ** 3, projects: -1, clients: -1, automations: -1 },
  };
  return limits[plan];
};

export const Organization = mongoose.model<IOrganization, IOrganizationModel>(
  'Organization',
  OrganizationSchema
);
