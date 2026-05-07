/**
 * GoogleCallbackPage
 *
 * The backend redirects here after a successful Google OAuth flow:
 *   /auth/google/callback#token=<accessToken>
 *
 * This page reads the access token from the URL fragment, stores it in the
 * auth store, then fetches the user profile and redirects to /dashboard.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash; // e.g. "#token=eyJ..."
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get('token');

    // Also handle error query param from backend failure redirect
    const searchParams = new URLSearchParams(window.location.search);
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError('Google sign-in failed. Please try again.');
      toast.error('Google sign-in failed');
      setTimeout(() => navigate('/auth/login?error=google_failed'), 2000);
      return;
    }

    if (!token) {
      setError('No token received from Google. Please try again.');
      setTimeout(() => navigate('/auth/login?error=google_failed'), 2000);
      return;
    }

    // Store token first so the api interceptor picks it up
    useAuthStore.getState().setAccessToken(token);

    // Use relative URL — works through Vite proxy (dev) and nginx proxy (Docker)
    fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error?.message || 'Failed to load profile');
        const user = res.data;
        login(
          {
            id: String(user._id ?? user.id ?? ''),
            email: String(user.email ?? ''),
            name: String(user.name ?? 'User'),
            role: String(user.role ?? 'CLIENT'),
            clientId: user.clientId ? String(user.clientId) : undefined,
            avatar: typeof user.avatar === 'string' ? user.avatar : undefined,
          },
          token
        );
        toast.success(`Welcome, ${user.name}!`);
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        setError('Failed to load your profile. Please try signing in again.');
        useAuthStore.getState().logout();
        setTimeout(() => navigate('/auth/login?error=google_failed'), 2500);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-destructive font-medium">{error}</p>
            <p className="text-muted-foreground text-sm mt-1">Redirecting to login…</p>
          </>
        ) : (
          <>
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Signing you in with Google…</p>
          </>
        )}
      </div>
    </div>
  );
}
