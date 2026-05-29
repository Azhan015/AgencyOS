/**
 * Integration Tests — modules/clients/clients.service.ts
 * Tests client CRUD and invitation flow with in-memory MongoDB.
 */
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup/testDb';
import { Client } from '../../models/Client';
import { User } from '../../models/User';
import { getOrCreateTestOrg, resetTestOrgCache } from '../setup/testFixtures';
import mongoose from 'mongoose';

// Mock Redis and email
jest.mock('../../config/redis', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  isRedisAvailable: jest.fn().mockReturnValue(false),
}));

jest.mock('../../lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  getInvitationEmail: jest.fn().mockReturnValue('<html>invite</html>'),
}));

import * as clientsService from '../../modules/clients/clients.service';
import { NotFoundError, ConflictError, ValidationError } from '../../lib/errors';

let testOrgId: mongoose.Types.ObjectId;

beforeAll(async () => { await connectTestDb(); });
beforeEach(async () => { testOrgId = await getOrCreateTestOrg(); });
afterEach(async () => { await clearTestDb(); resetTestOrgCache(); });
afterAll(async () => { await disconnectTestDb(); });

const BASE_CLIENT = {
  companyName: 'Acme Corp',
  contactName: 'John Doe',
  email: 'john@acme.com',
};

// Helper: create client with org context by directly inserting
async function createTestClient(data: typeof BASE_CLIENT & Record<string, unknown> = BASE_CLIENT) {
  const { generateSlug } = await import('../../lib/crypto');
  const slug = generateSlug(data.companyName as string);
  return Client.create({ ...data, slug, email: (data.email as string).toLowerCase(), organizationId: testOrgId });
}

// ── createClient ──────────────────────────────────────────────────────────────
describe('clientsService.createClient', () => {
  it('creates a client with required fields', async () => {
    const client = await createTestClient(BASE_CLIENT);
    expect(client._id).toBeDefined();
    expect(client.email).toBe('john@acme.com');
    expect(client.companyName).toBe('Acme Corp');
    expect(client.slug).toMatch(/^acme-corp/);
  });

  it('lowercases email', async () => {
    const client = await createTestClient({ ...BASE_CLIENT, email: 'UPPER@ACME.COM' });
    expect(client.email).toBe('upper@acme.com');
  });

  it('throws ConflictError for duplicate email', async () => {
    await createTestClient(BASE_CLIENT);
    // The service layer enforces email uniqueness — test via service
    await expect(
      clientsService.createClient(BASE_CLIENT)
    ).rejects.toThrow(ConflictError);
  });
});

// ── getClient ─────────────────────────────────────────────────────────────────
describe('clientsService.getClient', () => {
  it('returns the client by ID', async () => {
    const created = await createTestClient(BASE_CLIENT);
    const found = await clientsService.getClient(created._id.toString());
    expect(found.email).toBe('john@acme.com');
  });

  it('throws NotFoundError for unknown ID', async () => {
    const fakeId = '507f1f77bcf86cd799439011';
    await expect(clientsService.getClient(fakeId)).rejects.toThrow(NotFoundError);
  });
});

// ── updateClient ──────────────────────────────────────────────────────────────
describe('clientsService.updateClient', () => {
  it('updates contactName', async () => {
    const client = await createTestClient(BASE_CLIENT);
    const updated = await clientsService.updateClient(client._id.toString(), { contactName: 'Jane Doe' } as any);
    expect(updated.contactName).toBe('Jane Doe');
  });

  it('throws NotFoundError for unknown ID', async () => {
    await expect(clientsService.updateClient('507f1f77bcf86cd799439011', {} as any)).rejects.toThrow(NotFoundError);
  });
});

// ── deleteClient (soft delete) ────────────────────────────────────────────────
describe('clientsService.deleteClient', () => {
  it('sets status to SUSPENDED', async () => {
    const client = await createTestClient(BASE_CLIENT);
    await clientsService.deleteClient(client._id.toString());
    const found = await Client.findById(client._id);
    expect(found!.status).toBe('SUSPENDED');
  });

  it('throws NotFoundError for unknown ID', async () => {
    await expect(clientsService.deleteClient('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundError);
  });
});

// ── listClients ───────────────────────────────────────────────────────────────
describe('clientsService.listClients', () => {
  beforeEach(async () => {
    await createTestClient({ companyName: 'Alpha', contactName: 'A', email: 'a@alpha.com' });
    await createTestClient({ companyName: 'Beta', contactName: 'B', email: 'b@beta.com' });
    await createTestClient({ companyName: 'Gamma', contactName: 'G', email: 'g@gamma.com' });
  });

  it('returns all clients with pagination', async () => {
    const result = await clientsService.listClients({ page: 1, limit: 10 });
    expect(result.total).toBe(3);
    expect(result.clients).toHaveLength(3);
  });

  it('paginates correctly', async () => {
    const result = await clientsService.listClients({ page: 1, limit: 2 });
    expect(result.clients).toHaveLength(2);
    expect(result.pages).toBe(2);
  });

  it('filters by search term', async () => {
    const result = await clientsService.listClients({ search: 'alpha' });
    expect(result.clients).toHaveLength(1);
    expect(result.clients[0].companyName).toBe('Alpha');
  });
});

// ── inviteClient ──────────────────────────────────────────────────────────────
describe('clientsService.inviteClient', () => {
  it('creates a User record and sends invite email', async () => {
    const client = await createTestClient(BASE_CLIENT);
    const { sendEmail } = await import('../../lib/email');
    (sendEmail as jest.Mock).mockClear();

    await clientsService.inviteClient(client._id.toString(), false, 'http://localhost:5173');

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const user = await User.findOne({ email: 'john@acme.com' });
    expect(user).not.toBeNull();
    expect(user!.role).toBe('CLIENT');
  });

  it('throws NotFoundError for unknown client ID', async () => {
    await expect(clientsService.inviteClient('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundError);
  });
});

// ── acceptInvite ──────────────────────────────────────────────────────────────
describe('clientsService.acceptInvite', () => {
  it('throws ValidationError for invalid token', async () => {
    await expect(clientsService.acceptInvite('bad-token', 'Password1!')).rejects.toThrow(ValidationError);
  });
});
