import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import type { AuthUser } from '../stores/authStore';
import api from '../services/api';
import toast from 'react-hot-toast';

export function useAuth() {
  const { user, isAuthenticated } = useAuthStore();
  return { user, isAuthenticated };
}

function normalizeAuthUser(user: Record<string, unknown>): AuthUser {
  return {
    id: String(user.id ?? user._id ?? ''),
    email: String(user.email ?? ''),
    name: String(user.name ?? 'User'),
    role: String(user.role ?? 'CLIENT'),
    clientId: user.clientId ? String(user.clientId) : undefined,
    avatar: typeof user.avatar === 'string' ? user.avatar : undefined,
  };
}

export function useRegister() {
  const { login } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (data: { name: string; email: string; password: string }) => {
      const response = await api.post('/auth/register', data);
      return response.data.data;
    },
    onSuccess: (data) => {
      login(normalizeAuthUser(data.user), data.accessToken);
      toast.success('Account created! Welcome to Agency OS.');
      navigate('/dashboard');
    },
    // No onError here — RegisterPage handles errors inline with its own banner
  });
}

export function useLogin() {
  const { login } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await api.post('/auth/login', data);
      return response.data.data;
    },
    onSuccess: (data) => {
      const user = normalizeAuthUser(data.user);
      login(user, data.accessToken);
      toast.success('Welcome back!');
      // Navigate to the correct dashboard based on role
      navigate('/dashboard');
    },
    // No onError here — let the caller handle it so the LoginPage can show
    // an inline error banner instead of just a toast
  });
}

export function useLogout() {
  const { logout: storeLogout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSettled: () => {
      storeLogout();
      queryClient.clear();
      navigate('/auth/login');
    },
  });
}

export function useMagicLink() {
  return useMutation({
    mutationFn: async (email: string) => {
      const response = await api.post('/auth/magic-link', { email });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Magic link sent! Check your email.');
    },
    onError: () => {
      toast.error('Failed to send magic link');
    },
  });
}

export function useVerifyMagicLink() {
  const { login } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (token: string) => {
      const response = await api.post('/auth/magic-link/verify', { token });
      return response.data.data;
    },
    onSuccess: (data) => {
      login(normalizeAuthUser(data.user), data.accessToken);
      navigate('/dashboard');
    },
    onError: () => {
      toast.error('Invalid or expired magic link');
      navigate('/auth/login');
    },
  });
}

export function useMe() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await api.get('/auth/me');
      return response.data.data;
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 10,
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const response = await api.post('/auth/forgot-password', { email });
      return response.data;
    },
    onError: () => {
      toast.error('Failed to send reset link. Please try again.');
    },
  });
}

export function useResetPassword() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      const response = await api.post('/auth/reset-password', data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Password reset successfully. Please sign in.');
      navigate('/auth/login');
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to reset password. The link may have expired.';
      toast.error(msg);
    },
  });
}
