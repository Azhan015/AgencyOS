/**
 * Integration Tests — modules/auth/auth.service.ts
 * Uses MongoMemoryServer (started in globalSetup) and mocks Redis + email.
 */
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup/testDb';
import { User } from '../../models/User';

// ── Mock Redis so tests don't need a real Redis instance ──────────────────────
jest.mock('../../config/redis', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  isRedisAvailable: jest.fn().mockReturnValue(false),
}));

// ── Mock email so no real SMTP calls are made ─────────────────────────────────
jest.mock('../../lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  getMagicLinkEmail: jest.fn().mockReturnValue('<html>magic</html>'),
  getPasswordResetEmail: jest.fn().mockReturnValue('<html>reset</html>'),
}));

import * as authService from '../../modules/auth/auth.service';
import { AuthenticationError, ConflictError } from '../../lib/errors';

const DEVICE = { deviceId: 'dev-1', userAgent: 'jest', ip: '127.0.0.1' };

beforeAll(async () => { await connectTestDb(); });
afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

// ── register ──────────────────────────────────────────────────────────────────
describe('authService.register', () => {
  it('creates a new user and returns tokens', async () => {
    const result = await authService.register({
      email: 'alice@test.com',
      password: 'Password123!',
      name: 'Alice',
      deviceInfo: DEVICE,
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.email).toBe('alice@test.com');
    expect(result.user.name).toBe('Alice');
    // passwordHash must NOT be in the safe object
    expect((result.user as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('throws ConflictError when email already exists', async () => {
    await authService.register({ email: 'dup@test.com', password: 'Pass1234!', name: 'Dup', deviceInfo: DEVICE });
    await expect(
      authService.register({ email: 'dup@test.com', password: 'Pass1234!', name: 'Dup2', deviceInfo: DEVICE })
    ).rejects.toThrow(ConflictError);
  });

  it('assigns CLIENT role by default', async () => {
    const result = await authService.register({ email: 'c@test.com', password: 'Pass1234!', name: 'C', deviceInfo: DEVICE });
    expect(result.user.role).toBe('CLIENT');
  });

  it('normalises email to lowercase', async () => {
    const result = await authService.register({ email: 'UPPER@TEST.COM', password: 'Pass1234!', name: 'U', deviceInfo: DEVICE });
    expect(result.user.email).toBe('upper@test.com');
  });
});

// ── login ─────────────────────────────────────────────────────────────────────
describe('authService.login', () => {
  beforeEach(async () => {
    await authService.register({ email: 'bob@test.com', password: 'BobPass1!', name: 'Bob', deviceInfo: DEVICE });
  });

  it('returns tokens for valid credentials', async () => {
    const result = await authService.login('bob@test.com', 'BobPass1!', DEVICE);
    expect(result.accessToken).toBeTruthy();
    expect(result.user.email).toBe('bob@test.com');
  });

  it('throws AuthenticationError for wrong password', async () => {
    await expect(authService.login('bob@test.com', 'WrongPass!', DEVICE)).rejects.toThrow(AuthenticationError);
  });

  it('throws AuthenticationError for non-existent email', async () => {
    await expect(authService.login('nobody@test.com', 'Pass1234!', DEVICE)).rejects.toThrow(AuthenticationError);
  });

  it('throws AuthenticationError for inactive user', async () => {
    await User.findOneAndUpdate({ email: 'bob@test.com' }, { isActive: false });
    await expect(authService.login('bob@test.com', 'BobPass1!', DEVICE)).rejects.toThrow(AuthenticationError);
  });

  it('throws descriptive error for Google-only account (no passwordHash)', async () => {
    await User.create({ email: 'google@test.com', name: 'G', role: 'CLIENT', googleId: 'gid-1' });
    await expect(authService.login('google@test.com', 'anything', DEVICE)).rejects.toThrow(/Google sign-in/);
  });
});

// ── sendMagicLink ─────────────────────────────────────────────────────────────
describe('authService.sendMagicLink', () => {
  it('returns { sent: false } for non-existent email (no error thrown)', async () => {
    const result = await authService.sendMagicLink('ghost@test.com');
    expect(result.sent).toBe(false);
  });

  it('returns { sent: false } for inactive user', async () => {
    await User.create({ email: 'inactive@test.com', name: 'I', role: 'CLIENT', isActive: false });
    const result = await authService.sendMagicLink('inactive@test.com');
    expect(result.sent).toBe(false);
  });

  it('returns { sent: true } and calls sendEmail for existing active user', async () => {
    await authService.register({ email: 'magic@test.com', password: 'Pass1234!', name: 'M', deviceInfo: DEVICE });
    const { sendEmail } = await import('../../lib/email');
    (sendEmail as jest.Mock).mockClear();

    const result = await authService.sendMagicLink('magic@test.com', 'http://localhost:5173');
    expect(result.sent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe('magic@test.com');
  });
});

// ── sendPasswordReset ─────────────────────────────────────────────────────────
describe('authService.sendPasswordReset', () => {
  it('silently succeeds for non-existent email', async () => {
    await expect(authService.sendPasswordReset('ghost@test.com')).resolves.toBeUndefined();
  });

  it('calls sendEmail for existing user', async () => {
    await authService.register({ email: 'reset@test.com', password: 'Pass1234!', name: 'R', deviceInfo: DEVICE });
    const { sendEmail } = await import('../../lib/email');
    (sendEmail as jest.Mock).mockClear();

    await authService.sendPasswordReset('reset@test.com', 'http://localhost:5173');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

// ── logout ────────────────────────────────────────────────────────────────────
describe('authService.logout', () => {
  it('resolves without error', async () => {
    await expect(authService.logout('sess-123')).resolves.toBeUndefined();
  });
});
