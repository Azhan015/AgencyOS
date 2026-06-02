/**
 * Test fixtures — shared helpers for integration tests.
 *
 * Creates a default Organization and returns its ID so tests can
 * attach users/clients/etc. to a valid tenant.
 *
 * NOTE: Each test file manages its own testOrgId. Call resetTestOrgCache()
 * in afterEach alongside clearTestDb() to ensure a fresh org is created
 * for the next test.
 */
import mongoose from 'mongoose';
import { Organization } from '../../models/Organization';

// Module-level cache — scoped to the current Jest worker process.
// Each test file runs in its own worker, so this is effectively per-file.
let _defaultOrgId: mongoose.Types.ObjectId | null = null;

/**
 * Creates (or returns cached) a default test organization.
 * Call this at the start of each test (or in beforeAll/beforeEach).
 */
export async function getOrCreateTestOrg(): Promise<mongoose.Types.ObjectId> {
  if (_defaultOrgId) {
    // Verify the org still exists in DB (may have been cleared)
    const exists = await Organization.exists({ _id: _defaultOrgId });
    if (exists) return _defaultOrgId;
    _defaultOrgId = null;
  }

  const org = await Organization.create({
    name: 'Test Organization',
    slug: `test-org-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ownerEmail: 'owner@test.com',
    status: 'ACTIVE',
    plan: 'TRIAL',
  });

  _defaultOrgId = org._id as mongoose.Types.ObjectId;
  return _defaultOrgId;
}

/**
 * Reset the cached org ID — call in afterEach alongside clearTestDb().
 */
export function resetTestOrgCache(): void {
  _defaultOrgId = null;
}
