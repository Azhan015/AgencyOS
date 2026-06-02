/**
 * testDb.ts — per-suite DB helpers.
 *
 * Call connectTestDb() in beforeAll and clearTestDb() in afterEach.
 *
 * NOTE: disconnectTestDb() is a no-op when running in the full suite
 * (--runInBand) because globalTeardown handles the final disconnect.
 * This prevents one suite's afterAll from closing the shared connection
 * and breaking subsequent suites.
 */
import mongoose from 'mongoose';

export async function connectTestDb(): Promise<void> {
  const uri = process.env.MONGODB_URI_TEST || process.env.MONGODB_URI;
  if (!uri) throw new Error('No MongoDB URI set for tests');
  // Only connect if not already connected — avoids duplicate connections
  // when multiple suites run in the same process (--runInBand)
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
}

export async function clearTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map(c => c.deleteMany({}))
  );
}

export async function disconnectTestDb(): Promise<void> {
  // Only disconnect if this is the last suite (globalTeardown handles it).
  // Calling disconnect mid-run breaks subsequent suites sharing the connection.
  // We intentionally leave the connection open — globalTeardown closes it.
}
