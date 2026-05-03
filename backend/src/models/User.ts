import mongoose, { Document, Schema, Model } from 'mongoose';
import argon2 from 'argon2';

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'PROJECT_MANAGER' | 'CONTRIBUTOR' | 'CLIENT';

export interface IDevice {
  deviceId: string;
  userAgent: string;
  lastSeenAt: Date;
  ipAddress?: string;
}

export interface INotificationPrefs {
  email: {
    immediate: boolean;
    digest: 'none' | 'hourly' | 'daily';
  };
  inApp: boolean;
  push: boolean;
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash?: string;
  name: string;
  avatar?: string;
  role: UserRole;
  clientId?: mongoose.Types.ObjectId;
  isActive: boolean;
  lastLoginAt?: Date;
  devices: IDevice[];
  notificationPrefs: INotificationPrefs;
  googleId?: string;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(password: string): Promise<boolean>;
  toSafeObject(): Partial<IUser>;
}

export interface IUserModel extends Model<IUser> {
  findByEmail(email: string): Promise<IUser | null>;
}

const DeviceSchema = new Schema<IDevice>({
  deviceId: { type: String, required: true },
  userAgent: { type: String, required: true },
  lastSeenAt: { type: Date, default: Date.now },
  ipAddress: String,
}, { _id: false });

const NotificationPrefsSchema = new Schema<INotificationPrefs>({
  email: {
    immediate: { type: Boolean, default: true },
    digest: { type: String, enum: ['none', 'hourly', 'daily'], default: 'none' },
  },
  inApp: { type: Boolean, default: true },
  push: { type: Boolean, default: false },
}, { _id: false });

const UserSchema = new Schema<IUser, IUserModel>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  passwordHash: { type: String, select: false },
  name: { type: String, required: true, trim: true },
  avatar: String,
  role: {
    type: String,
    enum: ['SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR', 'CLIENT'],
    required: true,
    default: 'CLIENT',
  },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', index: true },
  isActive: { type: Boolean, default: true },
  lastLoginAt: Date,
  devices: [DeviceSchema],
  notificationPrefs: { type: NotificationPrefsSchema, default: () => ({}) },
  googleId: { type: String, sparse: true, index: true },
  passwordResetToken: { type: String, select: false },
  passwordResetExpiry: { type: Date, select: false },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ clientId: 1, role: 1 });
UserSchema.index({ googleId: 1 }, { sparse: true });

// Methods
UserSchema.methods.comparePassword = async function(password: string): Promise<boolean> {
  if (!this.passwordHash) return false;
  return argon2.verify(this.passwordHash, password);
};

UserSchema.methods.toSafeObject = function(): Partial<IUser> {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpiry;
  delete obj.__v;
  return obj;
};

// Statics
UserSchema.statics.findByEmail = function(email: string): Promise<IUser | null> {
  return this.findOne({ email: email.toLowerCase().trim() });
};

// Pre-save hook to hash password
UserSchema.pre('save', async function(next) {
  if (this.isModified('passwordHash') && this.passwordHash && !this.passwordHash.startsWith('$argon2')) {
    this.passwordHash = await argon2.hash(this.passwordHash, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }
  next();
});

export const User = mongoose.model<IUser, IUserModel>('User', UserSchema);
