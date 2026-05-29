import http from 'http';
import app from './app';
import { connectDB } from './config/db';
import { connectRedis } from './config/redis';
import { initSocketServer } from './sockets/socketServer';
import { startScheduledJobs } from './workers/scheduledJobs';
import { startTrialLifecycleJobs } from './workers/trialLifecycleJobs';
import { env } from './config/env';
import { logger } from './lib/logger';

const PORT = env.PORT || 5000;

async function bootstrap(): Promise<void> {
  try {
    // Connect to databases
    await connectDB();
    await connectRedis();

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Initialize Socket.io
    initSocketServer(httpServer);

    // Start scheduled jobs
    startScheduledJobs();
    startTrialLifecycleJobs();

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Agency OS API running on port ${PORT} [${env.NODE_ENV}]`);
      logger.info(`📡 API: http://localhost:${PORT}/api/${env.API_VERSION}`);
      logger.info(`❤️  Health: http://localhost:${PORT}/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received');

      httpServer.close(async () => {
        logger.info('HTTP server closed');

        const { disconnectDB } = await import('./config/db');
        const { disconnectRedis } = await import('./config/redis');

        await disconnectDB();
        await disconnectRedis();

        logger.info('Graceful shutdown complete');
        process.exit(0);
      });

      // Force exit after 30s
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, 'Unhandled promise rejection');
    });

    process.on('uncaughtException', (err) => {
      logger.error({ err }, 'Uncaught exception');
      process.exit(1);
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

bootstrap();
