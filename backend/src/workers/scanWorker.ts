/**
 * Scan Worker — Bull queue for async virus scanning.
 *
 * When VIRUS_SCAN_ENABLED=true, downloads the file from S3/R2 and
 * scans it via ClamAV (TCP socket to clamd daemon).
 *
 * When VIRUS_SCAN_ENABLED=false (default), marks files CLEAN immediately.
 *
 * ClamAV setup:
 *   - Run clamd on CLAMAV_HOST:CLAMAV_PORT (default localhost:3310)
 *   - Or use a managed service like ClamAV on AWS (via Lambda or ECS)
 *   - AWS Malware Protection for S3 can also be used as an alternative
 */

import { File } from '../models/File';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { isRedisAvailable } from '../config/redis';
import { getBullRedisOptions } from '../config/bullRedis';

// Lazy-initialized Bull queue — only created when Redis is available
let _scanQueue: import('bull').Queue | null = null;

/**
 * Scan a file buffer against ClamAV via TCP socket.
 * Returns 'CLEAN' or 'INFECTED'.
 */
async function scanWithClamAV(buffer: Buffer): Promise<'CLEAN' | 'INFECTED'> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const net = require('net');
    const socket = net.createConnection(env.CLAMAV_PORT, env.CLAMAV_HOST);
    const chunks: Buffer[] = [];

    socket.setTimeout(30000); // 30s timeout

    socket.on('connect', () => {
      // ClamAV INSTREAM protocol: send INSTREAM command, then chunks prefixed with 4-byte length
      socket.write('zINSTREAM\0');
      // Send file in one chunk
      const sizeBuffer = Buffer.alloc(4);
      sizeBuffer.writeUInt32BE(buffer.length, 0);
      socket.write(sizeBuffer);
      socket.write(buffer);
      // Terminate stream with 4 zero bytes
      socket.write(Buffer.alloc(4));
    });

    socket.on('data', (data: Buffer) => {
      chunks.push(data);
    });

    socket.on('end', () => {
      const response = Buffer.concat(chunks).toString('utf8').trim();
      logger.debug({ response }, 'ClamAV scan response');

      if (response.includes('OK') && !response.includes('FOUND')) {
        resolve('CLEAN');
      } else if (response.includes('FOUND')) {
        const virusName = response.split(':')[1]?.trim() ?? 'Unknown';
        logger.warn({ virusName }, 'ClamAV: virus detected');
        resolve('INFECTED');
      } else {
        reject(new Error(`ClamAV unexpected response: ${response}`));
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('ClamAV scan timed out'));
    });

    socket.on('error', (err: Error) => {
      reject(new Error(`ClamAV connection error: ${err.message}`));
    });
  });
}

function getScanQueue(): import('bull').Queue | null {
  if (!isRedisAvailable()) return null;
  if (!_scanQueue) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Bull = require('bull');
    _scanQueue = new Bull('file-scan', {
      redis: getBullRedisOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    _scanQueue!.process(async (job: import('bull').Job) => {
      const { fileId, storageKey } = job.data;

      try {
        if (!env.VIRUS_SCAN_ENABLED) {
          // Scanning disabled — mark clean immediately
          await File.findByIdAndUpdate(fileId, { scanStatus: 'CLEAN' });
          return { status: 'CLEAN', fileId };
        }

        // Download file from S3/R2 for scanning
        const { getS3Client, getBucketName } = await import('../config/storage');
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');

        const s3 = getS3Client();
        const response = await s3.send(new GetObjectCommand({
          Bucket: getBucketName(),
          Key: storageKey,
        }));

        // Convert stream to buffer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream = response.Body as any;
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);

        // Scan with ClamAV
        const scanResult = await scanWithClamAV(buffer);

        await File.findByIdAndUpdate(fileId, { scanStatus: scanResult });

        if (scanResult === 'INFECTED') {
          logger.warn({ fileId, storageKey }, 'Infected file detected — marked INFECTED');
          // Optionally: delete from storage immediately
          // await deleteFile(storageKey);
        } else {
          logger.info({ fileId, storageKey }, 'File scan completed: CLEAN');
        }

        return { status: scanResult, fileId };
      } catch (err) {
        logger.error({ err, fileId }, 'File scan failed');
        await File.findByIdAndUpdate(fileId, { scanStatus: 'FAILED' });
        throw err;
      }
    });

    _scanQueue!.on('failed', (job: import('bull').Job, err: Error) => {
      logger.error({ jobId: job.id, err }, 'Scan job failed after all retries');
    });
  }
  return _scanQueue;
}

// Named export for compatibility with files.service.ts
// files.service.ts calls: const { scanQueue } = await import('../../workers/scanWorker');
// then: const queue = scanQueue();
export { getScanQueue as scanQueue };
