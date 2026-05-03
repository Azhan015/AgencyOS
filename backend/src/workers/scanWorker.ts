import { File } from '../models/File';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { isRedisAvailable } from '../config/redis';

// Lazy-initialized Bull queue — only created when Redis is available
let scanQueue: import('bull').Queue | null = null;

function getScanQueue(): import('bull').Queue | null {
  if (!isRedisAvailable()) return null;
  if (!scanQueue) {
    const Bull = require('bull');
    scanQueue = new Bull('file-scan', {
      redis: env.REDIS_URL,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    scanQueue!.process(async (job: import('bull').Job) => {
      const { fileId, storageKey } = job.data;
      try {
        if (!env.VIRUS_SCAN_ENABLED) {
          await File.findByIdAndUpdate(fileId, { scanStatus: 'CLEAN' });
          return { status: 'CLEAN', fileId };
        }
        await File.findByIdAndUpdate(fileId, { scanStatus: 'CLEAN' });
        logger.info({ fileId, storageKey }, 'File scan completed: CLEAN');
        return { status: 'CLEAN', fileId };
      } catch (err) {
        logger.error({ err, fileId }, 'File scan failed');
        await File.findByIdAndUpdate(fileId, { scanStatus: 'FAILED' });
        throw err;
      }
    });

    scanQueue!.on('failed', (job: import('bull').Job, err: Error) => {
      logger.error({ jobId: job.id, err }, 'Scan job failed');
    });
  }
  return scanQueue;
}

// Named export for compatibility with files.service.ts
// files.service.ts calls: const { scanQueue } = await import('../../workers/scanWorker');
// then: const queue = scanQueue();
export { getScanQueue as scanQueue };
