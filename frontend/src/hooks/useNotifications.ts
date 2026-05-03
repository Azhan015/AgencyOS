import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useNotificationStore } from '../stores/notificationStore';
import { useEffect } from 'react';

export function useNotifications(options?: { unread?: boolean; limit?: number }) {
  const { setNotifications } = useNotificationStore();

  const query = useQuery({
    queryKey: ['notifications', options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.unread) params.set('unread', 'true');
      if (options?.limit) params.set('limit', String(options.limit));
      const response = await api.get(`/notifications?${params}`);
      return response.data.data;
    },
    refetchInterval: 30000, // Poll every 30s
  });

  useEffect(() => {
    if (query.data) {
      setNotifications(query.data.notifications, query.data.unreadCount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  return query;
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { markRead } = useNotificationStore();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/notifications/${id}/read`);
      return id;
    },
    onSuccess: (id) => {
      markRead(id);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  const { markAllRead } = useNotificationStore();

  return useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all');
    },
    onSuccess: () => {
      markAllRead();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
