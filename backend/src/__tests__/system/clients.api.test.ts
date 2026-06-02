/**
 * System Tests — Clients API endpoints
 * Full HTTP round-trips. Tests CRUD, auth guards, and role-based access.
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
  getMagicLinkEmail: jest.fn().mockReturnValue('<html>magic</html>'),
  getPasswordResetEmail: jest.fn().mockReturnValue('<html>reset</html>'),
  getTeamInviteEmail: jest.fn().mockReturnValue('<html>team</html>'),
  getClientInviteEmail: jest.fn().mockReturnValue('<html>client</html>'),
  getInvitationEmail: jest.fn().mockReturnValue('<html>invite</html>'),
}));

jest.mock('../../lib/passport', () => ({ initPassport: jest.fn() }));

import app from '../../app';
import { User } from '../../models/User';
import { getOrCreateTestOrg, resetTestOrgCache } from '../setup/testFixtures';

const API = '/api/v1';

// Helper: register + login, return access token
async function getToken(email: string, password: string, name: string, role?: string): Promise<string> {
  const orgId = await getOrCreateTestOrg();
  const argon2 = await import('argon2');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const orgRoleMap: Record<string, string> = {
    SUPERADMIN: 'ORGANIZATION_OWNER',
    ADMIN: 'ORGANIZATION_ADMIN',
    PROJECT_MANAGER: 'PROJECT_MANAGER',
    CONTRIBUTOR: 'CONTRIBUTOR',
    CLIENT: 'CLIENT',
  };
  const legacyRole = role || 'ADMIN';
  const orgRole = orgRoleMap[legacyRole] || 'CLIENT';
  // Remove any existing user with this email to avoid conflicts
  await User.deleteOne({ email });
  await User.create({ email, name, role: legacyRole, orgRole, organizationId: orgId, passwordHash });
  const res = await request(app).post(`${API}/auth/login`).send({ email, password });
  return res.body.data?.accessToken;
}

beforeAll(async () => { await connectTestDb(); });
beforeEach(async () => { /* org created lazily in getToken */ });
afterEach(async () => { await clearTestDb(); resetTestOrgCache(); });
afterAll(async () => { await disconnectTestDb(); });

const VALID_CLIENT = {
  companyName: 'Acme Corp',
  contactName: 'John Doe',
  email: 'john@acme.com',
};

// ── GET /clients ──────────────────────────────────────────────────────────────
describe('GET /clients', () => {
  it('401 — unauthenticated', async () => {
    const res = await request(app).get(`${API}/clients`);
    expect(res.status).toBe(401);
  });

  it('200 — ADMIN can list clients', async () => {
    const token = await getToken('admin@test.com', 'Admin1234!', 'Admin', 'ADMIN');
    const res = await request(app).get(`${API}/clients`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.clients).toBeDefined();
  });

  it('403 — CONTRIBUTOR cannot list clients', async () => {
    const token = await getToken('contrib@test.com', 'Contrib1!', 'Contrib', 'CONTRIBUTOR');
    const res = await request(app).get(`${API}/clients`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ── POST /clients ─────────────────────────────────────────────────────────────
describe('POST /clients', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await getToken('admin@test.com', 'Admin1234!', 'Admin', 'ADMIN');
  });

  it('201 — ADMIN creates a client', async () => {
    const res = await request(app)
      .post(`${API}/clients`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(VALID_CLIENT);
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('john@acme.com');
    expect(res.body.data.slug).toMatch(/^acme-corp-/);
  });

  it('409 — duplicate email', async () => {
    await request(app).post(`${API}/clients`).set('Authorization', `Bearer ${adminToken}`).send(VALID_CLIENT);
    const res = await request(app).post(`${API}/clients`).set('Authorization', `Bearer ${adminToken}`).send(VALID_CLIENT);
    expect(res.status).toBe(409);
  });

  it('400 — missing required fields', async () => {
    const res = await request(app)
      .post(`${API}/clients`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyName: 'X' });
    expect(res.status).toBe(400);
  });

  it('403 — CLIENT role cannot create clients', async () => {
    const clientToken = await getToken('client@test.com', 'Client1!', 'Client', 'CLIENT');
    const res = await request(app)
      .post(`${API}/clients`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send(VALID_CLIENT);
    expect(res.status).toBe(403);
  });
});

// ── GET /clients/:id ──────────────────────────────────────────────────────────
describe('GET /clients/:id', () => {
  let adminToken: string;
  let clientId: string;

  beforeEach(async () => {
    adminToken = await getToken('admin@test.com', 'Admin1234!', 'Admin', 'ADMIN');
    const res = await request(app)
      .post(`${API}/clients`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(VALID_CLIENT);
    clientId = res.body.data._id;
  });

  it('200 — returns client by ID', async () => {
    const res = await request(app)
      .get(`${API}/clients/${clientId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('john@acme.com');
  });

  it('404 — unknown ID', async () => {
    const res = await request(app)
      .get(`${API}/clients/507f1f77bcf86cd799439011`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('400 — invalid ObjectId', async () => {
    const res = await request(app)
      .get(`${API}/clients/not-an-id`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

// ── PATCH /clients/:id ────────────────────────────────────────────────────────
describe('PATCH /clients/:id', () => {
  let adminToken: string;
  let clientId: string;

  beforeEach(async () => {
    adminToken = await getToken('admin@test.com', 'Admin1234!', 'Admin', 'ADMIN');
    const res = await request(app)
      .post(`${API}/clients`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(VALID_CLIENT);
    clientId = res.body.data._id;
  });

  it('200 — updates contactName', async () => {
    const res = await request(app)
      .patch(`${API}/clients/${clientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ contactName: 'Jane Doe' });
    expect(res.status).toBe(200);
    expect(res.body.data.contactName).toBe('Jane Doe');
  });
});

// ── DELETE /clients/:id ───────────────────────────────────────────────────────
describe('DELETE /clients/:id', () => {
  it('200 — soft-deletes (suspends) client', async () => {
    const adminToken = await getToken('admin@test.com', 'Admin1234!', 'Admin', 'ADMIN');
    const create = await request(app)
      .post(`${API}/clients`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(VALID_CLIENT);
    const id = create.body.data._id;

    const res = await request(app)
      .delete(`${API}/clients/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});
