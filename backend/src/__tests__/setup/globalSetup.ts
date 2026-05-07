/**
 * globalSetup.ts — runs ONCE before all test suites.
 * Starts a MongoDB Memory Server and writes the URI to an env var
 * so every test file can connect to the same in-memory instance.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

export default async function globalSetup() {
  mongod = await MongoMemoryServer.create({
    instance: { dbName: 'agency-os-test' },
  });
  const uri = mongod.getUri();
  // Make the URI available to all test processes via env
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_URI_TEST = uri;
  // Store the instance reference so globalTeardown can stop it
  (global as Record<string, unknown>).__MONGOD__ = mongod;
}
