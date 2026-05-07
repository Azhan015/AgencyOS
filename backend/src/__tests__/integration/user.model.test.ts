/**
 * Integration Tests — models/User.ts
 * Tests Mongoose model methods, statics, and schema constraints.
 */
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup/testDb';
import { User } from '../../models/User';

beforeAll(async () => { await connectTestDb(); });
afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

describe('User model', () => {
  // ── Creation ───────────────────────────────────────────────────────────────
  describe('create', () => {
    it('creates a user with required fields', async () => {
      const user = await User.create({ email: 'a@test.com', name: 'Alice', role: 'CLIENT' });
      expect(user._id).toBeDefined();
      expect(user.email).toBe('a@test.com');
      expect(user.isActive).toBe(true);
    });

    it('lowercases email on save', async () => {
      const user = await User.create({ email: 'UPPER@TEST.COM', name: 'U', role: 'CLIENT' });
      expect(user.email).toBe('upper@test.com');
    });

    it('rejects duplicate email', async () => {
      await User.create({ email: 'dup@test.com', name: 'D1', role: 'CLIENT' });
      await expect(User.create({ email: 'dup@test.com', name: 'D2', role: 'CLIENT' })).rejects.toThrow();
    });

    it('rejects invalid role', async () => {
      await expect(User.create({ email: 'x@test.com', name: 'X', role: 'INVALID_ROLE' })).rejects.toThrow();
    });

    it('defaults isActive to true', async () => {
      const user = await User.create({ email: 'b@test.com', name: 'B', role: 'ADMIN' });
      expect(user.isActive).toBe(true);
    });
  });

  // ── findByEmail static ─────────────────────────────────────────────────────
  describe('findByEmail', () => {
    it('finds user by email (case-insensitive)', async () => {
      await User.create({ email: 'find@test.com', name: 'F', role: 'CLIENT' });
      const found = await User.findByEmail('FIND@TEST.COM');
      expect(found).not.toBeNull();
      expect(found!.email).toBe('find@test.com');
    });

    it('returns null for non-existent email', async () => {
      const found = await User.findByEmail('ghost@test.com');
      expect(found).toBeNull();
    });
  });

  // ── toSafeObject ──────────────────────────────────────────────────────────
  describe('toSafeObject', () => {
    it('excludes passwordHash, passwordResetToken, __v', async () => {
      const user = await User.create({ email: 'safe@test.com', name: 'S', role: 'CLIENT' });
      const safe = user.toSafeObject() as Record<string, unknown>;
      expect(safe.passwordHash).toBeUndefined();
      expect(safe.passwordResetToken).toBeUndefined();
      expect(safe.__v).toBeUndefined();
      expect(safe.email).toBe('safe@test.com');
    });
  });

  // ── comparePassword ────────────────────────────────────────────────────────
  describe('comparePassword', () => {
    it('returns false when no passwordHash is set', async () => {
      const user = await User.create({ email: 'nopw@test.com', name: 'N', role: 'CLIENT' });
      expect(await user.comparePassword('anything')).toBe(false);
    });
  });

  // ── devices ───────────────────────────────────────────────────────────────
  describe('devices array', () => {
    it('starts empty', async () => {
      const user = await User.create({ email: 'dev@test.com', name: 'D', role: 'CLIENT' });
      expect(user.devices).toHaveLength(0);
    });
  });
});
