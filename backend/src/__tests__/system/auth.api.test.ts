/**
 * System Tests — Auth API endpoints
 * Full HTTP round-trips through the Express app using supertest.
 * MongoDB Memory Server is used; Redis and email are mocked.
 */
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup/testDb';
import { resetTestOrgCache } from '../setup/testFixtures';

// ── Mocks (must be before app import) ─────────────────────────────────────────
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

// Disable passport Google strategy in tests (no real OAuth)
jest.mock('../../lib/passport', () => ({ initPassport: jest.fn() }));

import app from '../../app';

const API = '/api/v1';

beforeAll(async () => { await connectTestDb(); });
afterEach(async () => { await clearTestDb(); resetTestOrgCache(); });
afterAll(async () => { await disconnectTestDb(); });

// ── Health check ──────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ── POST /auth/register ───────────────────────────────────────────────────────
describe('POST /auth/register', () => {
  const VALID = { email: 'alice@test.com', password: 'Password1!', name: 'Alice' };

  it('201 — creates user and returns accessToken', async () => {
    const res = await request(app).post(`${API}/auth/register`).send(VALID);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe('alice@test.com');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    // Refresh token cookie should be set
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('409 — duplicate email', async () => {
    await request(app).post(`${API}/auth/register`).send(VALID);
    const res = await request(app).post(`${API}/auth/register`).send(VALID);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('400 — missing name', async () => {
    const res = await request(app).post(`${API}/auth/register`).send({ email: 'x@test.com', password: 'Pass1234!' });
    expect(res.status).toBe(400);
  });

  it('400 — password too short', async () => {
    const res = await request(app).post(`${API}/auth/register`).send({ email: 'x@test.com', password: 'short', name: 'X' });
    expect(res.status).toBe(400);
  });

  it('400 — invalid email', async () => {
    const res = await request(app).post(`${API}/auth/register`).send({ email: 'not-an-email', password: 'Pass1234!', name: 'X' });
    expect(res.status).toBe(400);
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post(`${API}/auth/register`).send({
      email: 'bob@test.com', password: 'BobPass1!', name: 'Bob',
    });
  });

  it('200 — valid credentials return tokens', async () => {
    const res = await request(app).post(`${API}/auth/login`).send({ email: 'bob@test.com', password: 'BobPass1!' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe('bob@test.com');
  });

  it('401 — wrong password', async () => {
    const res = await request(app).post(`${API}/auth/login`).send({ email: 'bob@test.com', password: 'WrongPass!' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('401 — non-existent email', async () => {
    const res = await request(app).post(`${API}/auth/login`).send({ email: 'ghost@test.com', password: 'Pass1234!' });
    expect(res.status).toBe(401);
  });

  it('400 — missing password field', async () => {
    const res = await request(app).post(`${API}/auth/login`).send({ email: 'bob@test.com' });
    expect(res.status).toBe(400);
  });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────
describe('GET /auth/me', () => {
  let accessToken: string;

  beforeEach(async () => {
    const res = await request(app).post(`${API}/auth/register`).send({
      email: 'me@test.com', password: 'MePass1!', name: 'Me',
    });
    accessToken = res.body.data.accessToken;
  });

  it('200 — returns user profile with valid token', async () => {
    const res = await request(app)
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('me@test.com');
  });

  it('401 — no token', async () => {
    const res = await request(app).get(`${API}/auth/me`);
    expect(res.status).toBe(401);
  });

  it('401 — malformed token', async () => {
    const res = await request(app)
      .get(`${API}/auth/me`)
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
describe('POST /auth/logout', () => {
  it('200 — logs out authenticated user', async () => {
    const reg = await request(app).post(`${API}/auth/register`).send({
      email: 'logout@test.com', password: 'LogOut1!', name: 'Logout',
    });
    const token = reg.body.data.accessToken;

    const res = await request(app)
      .post(`${API}/auth/logout`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('401 — cannot logout without token', async () => {
    const res = await request(app).post(`${API}/auth/logout`);
    expect(res.status).toBe(401);
  });
});

// ── POST /auth/magic-link ─────────────────────────────────────────────────────
describe('POST /auth/magic-link', () => {
  it('200 — always returns success (no email enumeration)', async () => {
    const res = await request(app).post(`${API}/auth/magic-link`).send({ email: 'ghost@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('400 — invalid email format', async () => {
    const res = await request(app).post(`${API}/auth/magic-link`).send({ email: 'not-email' });
    expect(res.status).toBe(400);
  });
});

// ── POST /auth/magic-link/verify ──────────────────────────────────────────────
describe('POST /auth/magic-link/verify', () => {
  it('401 — invalid token', async () => {
    const res = await request(app).post(`${API}/auth/magic-link/verify`).send({ token: 'bad-token' });
    expect(res.status).toBe(401);
  });

  it('400 — missing token', async () => {
    const res = await request(app).post(`${API}/auth/magic-link/verify`).send({});
    expect(res.status).toBe(400);
  });
});

// ── POST /auth/forgot-password ────────────────────────────────────────────────
describe('POST /auth/forgot-password', () => {
  it('200 — always returns success (no email enumeration)', async () => {
    const res = await request(app).post(`${API}/auth/forgot-password`).send({ email: 'ghost@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── POST /auth/reset-password ─────────────────────────────────────────────────
describe('POST /auth/reset-password', () => {
  it('401 — invalid reset token', async () => {
    const res = await request(app).post(`${API}/auth/reset-password`).send({ token: 'bad', password: 'NewPass1!' });
    expect(res.status).toBe(401);
  });

  it('400 — password too short', async () => {
    const res = await request(app).post(`${API}/auth/reset-password`).send({ token: 'tok', password: 'short' });
    expect(res.status).toBe(400);
  });
});

// ── PATCH /auth/me ────────────────────────────────────────────────────────────
describe('PATCH /auth/me', () => {
  let accessToken: string;

  beforeEach(async () => {
    const res = await request(app).post(`${API}/auth/register`).send({
      email: 'patch@test.com', password: 'PatchMe1!', name: 'Patch',
    });
    accessToken = res.body.data.accessToken;
  });

  it('200 — updates name', async () => {
    const res = await request(app)
      .patch(`${API}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Name');
  });

  it('401 — requires authentication', async () => {
    const res = await request(app).patch(`${API}/auth/me`).send({ name: 'X' });
    expect(res.status).toBe(401);
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
