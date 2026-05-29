/**
 * Integration Tests — models/User.ts
 * Tests Mongoose model methods, statics, and schema constraints.
 */
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup/testDb';
import { User } from '../../models/User';
import { getOrCreateTestOrg, resetTestOrgCache } from '../setup/testFixtures';
import mongoose from 'mongoose';

let testOrgId: mongoose.Types.ObjectId;

beforeAll(async () => { await connectTestDb(); });
beforeEach(async () => { testOrgId = await getOrCreateTestOrg(); });
afterEach(async () => { await clearTestDb(); resetTestOrgCache(); });
afterAll(async () => { await disconnectTestDb(); });

// Helper: create a user with org context
function makeUser(overrides: Record<string, unknown> = {}) {
  return { role: 'CLIENT', orgRole: 'CLIENT', organizationId: testOrgId, ...overrides };
}

describe('User model', () => {
  // ── Creation ───────────────────────────────────────────────────────────────
  describe('create', () => {
    it('creates a user with required fields', async () => {
      const user = await User.create(makeUser({ email: 'a@test.com', name: 'Alice' }));
      expect(user._id).toBeDefined();
      expect(user.email).toBe('a@test.com');
      expect(user.isActive).toBe(true);
    });

    it('lowercases email on save', async () => {
      const user = await User.create(makeUser({ email: 'UPPER@TEST.COM', name: 'U' }));
      expect(user.email).toBe('upper@test.com');
    });

    it('rejects duplicate email within same org', async () => {
      await User.create(makeUser({ email: 'dup@test.com', name: 'D1' }));
      await expect(User.create(makeUser({ email: 'dup@test.com', name: 'D2' }))).rejects.toThrow();
    });

    it('rejects invalid role', async () => {
      await expect(User.create(makeUser({ email: 'x@test.com', name: 'X', role: 'INVALID_ROLE' }))).rejects.toThrow();
    });

    it('defaults isActive to true', async () => {
      const user = await User.create(makeUser({ email: 'b@test.com', name: 'B', role: 'ADMIN', orgRole: 'ORGANIZATION_ADMIN' }));
      expect(user.isActive).toBe(true);
    });
  });

  // ── findByEmail static ─────────────────────────────────────────────────────
  describe('findByEmail', () => {
    it('finds user by email (case-insensitive)', async () => {
      await User.create(makeUser({ email: 'find@test.com', name: 'F' }));
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
      const user = await User.create(makeUser({ email: 'safe@test.com', name: 'S' }));
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
      const user = await User.create(makeUser({ email: 'nopw@test.com', name: 'N' }));
      expect(await user.comparePassword('anything')).toBe(false);
    });
  });

  // ── devices ───────────────────────────────────────────────────────────────
  describe('devices array', () => {
    it('starts empty', async () => {
      const user = await User.create(makeUser({ email: 'dev@test.com', name: 'D' }));
      expect(user.devices).toHaveLength(0);
    });
  });
});
