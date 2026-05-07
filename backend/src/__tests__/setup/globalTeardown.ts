/**
 * globalTeardown.ts — runs ONCE after all test suites complete.
 * Stops the MongoDB Memory Server.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalTeardown() {
  const mongod = (global as Record<string, unknown>).__MONGOD__ as MongoMemoryServer | undefined;
  if (mongod) {
    await mongod.stop();
  }
}
