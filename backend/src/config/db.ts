import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../lib/logger';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

export async function connectDB(retries = MAX_RETRIES): Promise<void> {
  try {
    const uri = env.NODE_ENV === 'test' ? (env.MONGODB_URI_TEST || env.MONGODB_URI) : env.MONGODB_URI;

    // Detect Atlas vs local connection for appropriate timeout settings
    const isAtlas = uri.includes('mongodb+srv') || uri.includes('mongodb.net');

    await mongoose.connect(uri, {
      maxPoolSize: 20,
      minPoolSize: 5,
      // Atlas needs a longer server selection timeout (DNS + TLS handshake)
      serverSelectionTimeoutMS: isAtlas ? 15000 : 5000,
      socketTimeoutMS: 45000,
      // Atlas uses SRV records (IPv4 + IPv6) — let the driver pick the best
      family: isAtlas ? undefined : 4,
      // Retry writes are enabled by default on Atlas; explicit for local
      retryWrites: true,
      // Write concern: majority ensures data is written to primary + replica
      w: 'majority',
    });

    logger.info({ db: isAtlas ? 'Atlas' : 'local' }, '✅ MongoDB connected successfully');

    mongoose.connection.on('error', (err) => {
      logger.error({ err }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

  } catch (error) {
    const uri = env.MONGODB_URI;
    const isAtlas = uri.includes('mongodb+srv') || uri.includes('mongodb.net');

    if (retries > 0) {
      logger.warn(
        `MongoDB connection failed (${isAtlas ? 'Atlas' : 'local'}). ` +
        `Retrying in ${RETRY_DELAY_MS}ms... (${retries} retries left)`
      );
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return connectDB(retries - 1);
    }

    // Provide actionable error messages
    if (isAtlas) {
      logger.error(
        { error },
        'MongoDB Atlas connection failed after all retries. ' +
        'Check: 1) Atlas URI in MONGODB_URI is correct, ' +
        '2) Your IP is whitelisted in Atlas Network Access (or use 0.0.0.0/0 for dev), ' +
        '3) Username/password are correct and special chars are URL-encoded.'
      );
    } else {
      logger.error(
        { error },
        'MongoDB local connection failed after all retries. ' +
        'Check: 1) MongoDB is running (mongod), ' +
        '2) Port 27017 is not blocked, ' +
        '3) When using Docker, MONGODB_URI is overridden to mongodb://mongodb:27017/agency-os.'
      );
    }
    process.exit(1);
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}
