import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { verifyAccessToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import { env } from '../config/env';

let io: SocketServer;

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      socket.data.clientId = payload.clientId;
      socket.data.sessionId = payload.sessionId;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    logger.info({ userId, socketId: socket.id }, 'Socket connected');

    // Join personal room
    socket.join(`user:${userId}`);

    // Join project rooms
    socket.on('join:project', (projectId: string) => {
      socket.join(`project:${projectId}`);
      logger.debug({ userId, projectId }, 'User joined project room');
    });

    socket.on('leave:project', (projectId: string) => {
      socket.leave(`project:${projectId}`);
    });

    // Typing indicators
    socket.on('typing:start', (data: { projectId: string; channelId: string }) => {
      socket.to(`project:${data.projectId}`).emit('typing:start', {
        userId,
        channelId: data.channelId,
      });
    });

    socket.on('typing:stop', (data: { projectId: string; channelId: string }) => {
      socket.to(`project:${data.projectId}`).emit('typing:stop', {
        userId,
        channelId: data.channelId,
      });
    });

    // Presence
    socket.on('presence:update', (status: 'online' | 'away' | 'offline') => {
      socket.broadcast.emit('presence:update', { userId, status });
    });

    socket.on('disconnect', (reason) => {
      logger.info({ userId, socketId: socket.id, reason }, 'Socket disconnected');
      socket.broadcast.emit('presence:update', { userId, status: 'offline' });
    });

    socket.on('error', (err) => {
      logger.error({ err, userId }, 'Socket error');
    });
  });

  logger.info('✅ Socket.io server initialized');
  return io;
}

export function getSocketServer(): SocketServer {
  if (!io) throw new Error('Socket server not initialized');
  return io;
}
