import mongoose, { Document, Schema, Model } from 'mongoose';
import argon2 from 'argon2';

export type PlatformRole = 'PLATFORM_OWNER' | 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT';

export interface IPlatformUserDevice {
  deviceId: string;
  userAgent: string;
  lastSeenAt: Date;
  ipAddress: string;
}

export interface IPlatformUserLoginHistory {
  ip: string;
  userAgent: string;
  at: Date;
  success: boolean;
}

export interface IPlatformUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  avatar?: string;
  platformRole: PlatformRole;
  isActive: boolean;
  lastLoginAt?: Date;
  mfaEnabled: boolean;
  mfaSecret?: string;
  devices: IPlatformUserDevice[];
  createdBy?: mongoose.Types.ObjectId;
  loginHistory: IPlatformUserLoginHistory[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(password: string): Promise<boolean>;
  toSafeObject(): Partial<IPlatformUser>;
}

export interface IPlatformUserModel extends Model<IPlatformUser> {
  findByEmail(email: string): Promise<IPlatformUser | null>;
}

const PlatformUserSchema = new Schema<IPlatformUser, IPlatformUserModel>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    avatar: String,
    platformRole: {
      type: String,
      enum: ['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_SUPPORT'],
      required: true,
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false },
    devices: [
      {
        deviceId: String,
        userAgent: String,
        lastSeenAt: { type: Date, default: Date.now },
        ipAddress: String,
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: 'PlatformUser', sparse: true },
    loginHistory: [
      {
        ip: String,
        userAgent: String,
        at: { type: Date, default: Date.now },
        success: Boolean,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
PlatformUserSchema.index({ platformRole: 1 });
PlatformUserSchema.index({ isActive: 1 });

// ── Methods ────────────────────────────────────────────────────────────────────
PlatformUserSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  if (!this.passwordHash) return false;
  return argon2.verify(this.passwordHash, password);
};

PlatformUserSchema.methods.toSafeObject = function (): Partial<IPlatformUser> {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.mfaSecret;
  delete obj.__v;
  return obj;
};

// ── Statics ────────────────────────────────────────────────────────────────────
PlatformUserSchema.statics.findByEmail = function (email: string): Promise<IPlatformUser | null> {
  return this.findOne({ email: email.toLowerCase().trim() });
};

// ── Pre-save hook: hash password ───────────────────────────────────────────────
PlatformUserSchema.pre('save', async function (next) {
  if (
    this.isModified('passwordHash') &&
    this.passwordHash &&
    !this.passwordHash.startsWith('$argon2')
  ) {
    this.passwordHash = await argon2.hash(this.passwordHash, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }
  next();
});

export const PlatformUser = mongoose.model<IPlatformUser, IPlatformUserModel>(
  'PlatformUser',
  PlatformUserSchema
);
