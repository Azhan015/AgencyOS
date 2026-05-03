import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useQueryClient } from '@tanstack/react-query';

let socket: Socket | null = null;

// Determine the backend socket URL:
// - In dev, Vite proxies /socket.io → backend, so use relative '/'
// - In production, use the VITE_API_URL origin (strip the /api/v1 path)
function getSocketUrl(): string {
  if (!import.meta.env.PROD) return '/';
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!apiUrl) return '/';
  try {
    const url = new URL(apiUrl);
    return url.origin;
  } catch {
    return '/';
  }
}

export function useSocket() {
  const { accessToken, isAuthenticated } = useAuthStore();
  const addNotificationRef = useRef(useNotificationStore.getState().addNotification);
  const queryClientRef = useRef(useQueryClient());

  // Keep refs up to date without triggering reconnects
  useEffect(() => {
    addNotificationRef.current = useNotificationStore.getState().addNotification;
  });

  useEffect(() => {
    // Disconnect any existing socket first
    if (socket) {
      socket.disconnect();
      socket = null;
    }

    if (!isAuthenticated || !accessToken) return;

    const socketUrl = getSocketUrl();

    socket = io(socketUrl, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      // Socket connected
    });

    socket.on('disconnect', (_reason) => {
      // Socket disconnected
    });

    socket.on('notification:new', (notification) => {
      addNotificationRef.current(notification);
    });

    socket.on('message:new', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['messages'] });
    });

    socket.on('file:uploaded', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['files'] });
    });

    socket.on('approval:updated', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['approvals'] });
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [isAuthenticated, accessToken]);

  const joinProject = (projectId: string) => {
    socket?.emit('join:project', projectId);
  };

  const leaveProject = (projectId: string) => {
    socket?.emit('leave:project', projectId);
  };

  const sendTyping = (projectId: string, channelId: string, isTyping: boolean) => {
    socket?.emit(isTyping ? 'typing:start' : 'typing:stop', { projectId, channelId });
  };

  return { socket, joinProject, leaveProject, sendTyping };
}

export function getSocket(): Socket | null {
  return socket;
}
