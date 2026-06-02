/**
 * Socket.io Server — Multi-Tenant Edition
 *
 * Room naming convention (org-scoped, no cross-tenant leakage):
 *   organization:{orgId}                     — org-wide broadcasts
 *   organization:{orgId}:user:{userId}        — personal notifications
 *   organization:{orgId}:project:{projectId}  — project events
 *
 * Redis adapter is enabled when Redis is available, allowing horizontal
 * scaling across multiple Node.js instances.
 *
 * Legacy rooms (user:{userId}, project:{projectId}) are kept for backward
 * compat and will be removed in Phase 9.
 */

import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { verifyAccessToken, verifyPlatformAccessToken } from '../lib/jwt';
import { isRedisAvailable, getRedisSubscriber, getRedisPublisher } from '../config/redis';
import { logger } from '../lib/logger';
import { env } from '../config/env';

let io: SocketServer;

export function initSocketServer(httpServer: http.Server): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: [env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── Redis adapter — enables horizontal scaling across instances ──────────────
  // @socket.io/redis-adapter was installed but never wired. Enabling it here
  // means events emitted on instance A are received by clients on instance B.
  if (isRedisAvailable()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createAdapter } = require('@socket.io/redis-adapter');
      const pubClient = getRedisPublisher();
      const subClient = getRedisSubscriber();
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('✅ Socket.io Redis adapter enabled (multi-instance mode)');
    } catch (err) {
      logger.warn({ err }, 'Socket.io Redis adapter failed to initialize — running in single-instance mode');
    }
  } else {
    logger.warn('Redis unavailable — Socket.io running in single-instance mode');
  }

  // ── Authentication middleware ────────────────────────────────────────────────
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required'));

      // Try org-user token first
      try {
        const payload = verifyAccessToken(token);
        socket.data.userId = payload.sub;
        socket.data.role = payload.role;
        socket.data.orgRole = payload.orgRole;
        socket.data.organizationId = payload.organizationId;
        socket.data.clientId = payload.clientId;
        socket.data.sessionId = payload.sessionId;
        socket.data.isPlatformUser = false;
        return next();
      } catch {
        // Not an org token — try platform token
      }

      // Platform user (e.g. impersonating)
      const platformPayload = verifyPlatformAccessToken(token);
      socket.data.userId = platformPayload.sub;
      socket.data.platformRole = platformPayload.platformRole;
      socket.data.organizationId = platformPayload.impersonating?.organizationId ?? null;
      socket.data.isPlatformUser = true;
      socket.data.sessionId = platformPayload.sessionId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ───────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId        = socket.data.userId as string;
    const organizationId = socket.data.organizationId as string | null;
    const isPlatformUser = socket.data.isPlatformUser as boolean;

    logger.debug({ userId, organizationId, isPlatformUser, socketId: socket.id }, 'Socket connected');

    if (organizationId) {
      // Org-namespaced personal room — prevents cross-tenant notification injection
      socket.join(`organization:${organizationId}:user:${userId}`);
      // Org-wide room — for suspension notices, plan changes, announcements
      socket.join(`organization:${organizationId}`);

      // Legacy rooms — backward compat, removed in Phase 9
      socket.join(`org:${organizationId}:user:${userId}`);
      socket.join(`org:${organizationId}`);
      socket.join(`user:${userId}`);
    }

    // ── join:project ─────────────────────────────────────────────────────────
    socket.on('join:project', (projectId: string) => {
      if (!organizationId) return;
      // Org-namespaced project room — prevents cross-tenant room collisions
      socket.join(`organization:${organizationId}:project:${projectId}`);
      // Legacy rooms — backward compat
      socket.join(`org:${organizationId}:project:${projectId}`);
      socket.join(`project:${projectId}`);
      logger.debug({ userId, organizationId, projectId }, 'Joined project room');
    });

    socket.on('leave:project', (projectId: string) => {
      if (!organizationId) return;
      socket.leave(`organization:${organizationId}:project:${projectId}`);
      socket.leave(`org:${organizationId}:project:${projectId}`);
      socket.leave(`project:${projectId}`);
    });

    // ── typing:start / typing:stop ────────────────────────────────────────────
    socket.on('typing:start', (data: { projectId: string; channelId: string }) => {
      if (!organizationId) return;
      socket
        .to(`organization:${organizationId}:project:${data.projectId}`)
        .emit('typing:start', { userId, channelId: data.channelId });
    });

    socket.on('typing:stop', (data: { projectId: string; channelId: string }) => {
      if (!organizationId) return;
      socket
        .to(`organization:${organizationId}:project:${data.projectId}`)
        .emit('typing:stop', { userId, channelId: data.channelId });
    });

    // ── presence:update ───────────────────────────────────────────────────────
    socket.on('presence:update', (status: 'online' | 'away' | 'offline') => {
      if (!organizationId) return;
      socket
        .to(`organization:${organizationId}`)
        .emit('presence:update', { userId, status });
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.debug({ userId, organizationId, socketId: socket.id, reason }, 'Socket disconnected');
      if (organizationId) {
        io.to(`organization:${organizationId}`)
          .emit('presence:update', { userId, status: 'offline' });
      }
    });

    socket.on('error', (err) => {
      logger.error({ err, userId, organizationId }, 'Socket error');
    });
  });

  logger.info('✅ Socket.io server initialized (multi-tenant mode)');
  return io;
}

export function getSocketServer(): SocketServer {
  if (!io) throw new Error('Socket server not initialized');
  return io;
}

// ── Typed emit helpers — use these in all service files ───────────────────────

/**
 * Emit to all sockets in an organization (org-wide broadcast).
 * Use for: suspension notices, plan changes, announcements.
 */
export function emitToOrg(organizationId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`organization:${organizationId}`).emit(event, data);
}

/**
 * Emit to all sockets in an org's project room.
 * Use for: messages, file uploads, approval updates, typing indicators.
 */
export function emitToOrgProject(
  organizationId: string,
  projectId: string,
  event: string,
  data: unknown
): void {
  if (!io) return;
  io.to(`organization:${organizationId}:project:${projectId}`).emit(event, data);
}

/**
 * Emit to a specific user within an org.
 * Use for: notifications, direct messages.
 */
export function emitToOrgUser(
  organizationId: string,
  userId: string,
  event: string,
  data: unknown
): void {
  if (!io) return;
  io.to(`organization:${organizationId}:user:${userId}`).emit(event, data);
}
