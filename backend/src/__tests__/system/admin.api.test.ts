/**
 * System Tests — Admin API endpoints
 * Tests team management, role promotion, and audit log access.
 */
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup/testDb';

jest.mock('../../config/redis', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  isRedisAvailable: jest.fn().mockReturnValue(false),
  connectRedis: jest.fn().mockResolvedValue(undefined),
  disconnectRedis: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  getTeamInviteEmail: jest.fn().mockReturnValue('<html>team</html>'),
  getMagicLinkEmail: jest.fn().mockReturnValue('<html>magic</html>'),
  getPasswordResetEmail: jest.fn().mockReturnValue('<html>reset</html>'),
  getInvitationEmail: jest.fn().mockReturnValue('<html>invite</html>'),
}));

jest.mock('../../lib/passport', () => ({ initPassport: jest.fn() }));

import app from '../../app';
import { User } from '../../models/User';

const API = '/api/v1';

async function getToken(email: string, password: string, role: string): Promise<string> {
  const argon2 = await import('argon2');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await User.create({ email, name: 'Test', role, passwordHash });
  const res = await request(app).post(`${API}/auth/login`).send({ email, password });
  return res.body.data.accessToken;
}

beforeAll(async () => { await connectTestDb(); });
afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

// ── GET /admin/team ───────────────────────────────────────────────────────────
describe('GET /admin/team', () => {
  it('200 — ADMIN can list team', async () => {
    const token = await getToken('admin@test.com', 'Admin1234!', 'ADMIN');
    const res = await request(app).get(`${API}/admin/team`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('403 — CLIENT cannot access team list', async () => {
    const token = await getToken('client@test.com', 'Client1!', 'CLIENT');
    const res = await request(app).get(`${API}/admin/team`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated', async () => {
    const res = await request(app).get(`${API}/admin/team`);
    expect(res.status).toBe(401);
  });
});

// ── POST /admin/team/invite ───────────────────────────────────────────────────
describe('POST /admin/team/invite', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await getToken('admin@test.com', 'Admin1234!', 'ADMIN');
  });

  it('201 — invites a new team member', async () => {
    const { sendEmail } = await import('../../lib/email');
    (sendEmail as jest.Mock).mockClear();

    const res = await request(app)
      .post(`${API}/admin/team/invite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'pm@test.com', name: 'PM User', role: 'PROJECT_MANAGER' });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('PROJECT_MANAGER');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('409 — duplicate email', async () => {
    await request(app)
      .post(`${API}/admin/team/invite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'dup@test.com', name: 'Dup', role: 'CONTRIBUTOR' });

    const res = await request(app)
      .post(`${API}/admin/team/invite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'dup@test.com', name: 'Dup2', role: 'CONTRIBUTOR' });

    expect(res.status).toBe(409);
  });

  it('400 — invalid role', async () => {
    const res = await request(app)
      .post(`${API}/admin/team/invite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'x@test.com', name: 'X', role: 'SUPERADMIN' }); // not allowed via invite
    expect(res.status).toBe(400);
  });

  it('403 — PROJECT_MANAGER cannot invite team members', async () => {
    const pmToken = await getToken('pm@test.com', 'PM1234!', 'PROJECT_MANAGER');
    const res = await request(app)
      .post(`${API}/admin/team/invite`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({ email: 'new@test.com', name: 'New', role: 'CONTRIBUTOR' });
    expect(res.status).toBe(403);
  });
});

// ── PATCH /admin/team/:id/role ────────────────────────────────────────────────
describe('PATCH /admin/team/:id/role', () => {
  it('200 — ADMIN can change a team member role', async () => {
    const adminToken = await getToken('admin@test.com', 'Admin1234!', 'ADMIN');

    // Create a contributor
    const argon2 = await import('argon2');
    const ph = await argon2.hash('Contrib1!', { type: argon2.argon2id });
    const contrib = await User.create({ email: 'contrib@test.com', name: 'C', role: 'CONTRIBUTOR', passwordHash: ph });

    const res = await request(app)
      .patch(`${API}/admin/team/${contrib._id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'PROJECT_MANAGER' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('PROJECT_MANAGER');
  });
});

// ── PATCH /admin/team/:id/deactivate ─────────────────────────────────────────
describe('PATCH /admin/team/:id/deactivate', () => {
  it('200 — deactivates a user', async () => {
    const adminToken = await getToken('admin@test.com', 'Admin1234!', 'ADMIN');
    const argon2 = await import('argon2');
    const ph = await argon2.hash('Pass1234!', { type: argon2.argon2id });
    const user = await User.create({ email: 'target@test.com', name: 'T', role: 'CONTRIBUTOR', passwordHash: ph });

    const res = await request(app)
      .patch(`${API}/admin/team/${user._id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });
});

// ── GET /admin/audit-logs ─────────────────────────────────────────────────────
describe('GET /admin/audit-logs', () => {
  it('200 — ADMIN can read audit logs', async () => {
    const token = await getToken('admin@test.com', 'Admin1234!', 'ADMIN');
    const res = await request(app).get(`${API}/admin/audit-logs`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.logs).toBeDefined();
  });
});

// ── GET /admin/db-health ──────────────────────────────────────────────────────
describe('GET /admin/db-health', () => {
  it('200 — returns DB connection status', async () => {
    const token = await getToken('admin@test.com', 'Admin1234!', 'ADMIN');
    const res = await request(app).get(`${API}/admin/db-health`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('connected');
  });
});
