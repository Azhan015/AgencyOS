/**
 * testDb.ts — per-suite DB helpers.
 * Call connectTestDb() in beforeAll and clearTestDb() in afterEach.
 */
import mongoose from 'mongoose';

export async function connectTestDb(): Promise<void> {
  const uri = process.env.MONGODB_URI_TEST || process.env.MONGODB_URI;
  if (!uri) throw new Error('No MongoDB URI set for tests');
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
}

export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.disconnect();
}
