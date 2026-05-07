/**
 * loadEnv.ts — loaded by Jest's setupFiles before each test file.
 * Loads .env.test so the Zod env validator in config/env.ts passes.
 * The MONGODB_URI is then overridden by globalSetup.ts with the
 * MongoMemoryServer URI.
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });
