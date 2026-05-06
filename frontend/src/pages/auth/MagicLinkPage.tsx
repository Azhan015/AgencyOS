/**
 * MagicLinkPage — handles /auth/magic?token=<token>
 *
 * Completely isolated from LoginPage so there's no interference from
 * RequireGuest guards, form state, or other login logic.
 * Reads the token from the URL, calls the verify endpoint, stores the
 * result in the auth store, and navigates to /dashboard.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

function normalizeUser(user: Record<string, unknown>) {
  return {
    id: String(user.id ?? user._id ?? ''),
    email: String(user.email ?? ''),
    name: String(user.name ?? 'User'),
    role: String(user.role ?? 'CLIENT'),
    clientId: user.clientId ? String(user.clientId) : undefined,
    avatar: typeof user.avatar === 'string' ? user.avatar : undefined,
  };
}

export function MagicLinkPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [status, setStatus] = useState<'verifying' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const called = useRef(false); // prevent double-call in React StrictMode

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setErrorMsg('No token in URL. Please use the link from your email.');
      return;
    }

    // Call the backend directly — always use relative path so nginx/Vite proxy handles it
    fetch('/api/v1/auth/magic-link/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.success) {
          throw new Error(body.error?.message || 'Magic link verification failed');
        }
        return body.data;
      })
      .then((data) => {
        login(normalizeUser(data.user as Record<string, unknown>), data.accessToken as string);
        toast.success('Signed in successfully!');
        navigate('/dashboard', { replace: true });
      })
      .catch((err: Error) => {
        setStatus('error');
        setErrorMsg(err.message || 'This magic link is invalid or has expired.');
        toast.error(err.message || 'Magic link failed');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-sm">
        {status === 'verifying' ? (
          <>
            <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-medium">Signing you in…</p>
            <p className="text-muted-foreground text-sm mt-1">Please wait a moment.</p>
          </>
        ) : (
          <>
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-lg font-medium text-destructive">Link invalid or expired</p>
            <p className="text-muted-foreground text-sm mt-1 mb-6">{errorMsg}</p>
            <a
              href="/auth/login"
              className="inline-flex items-center justify-center h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Back to sign in
            </a>
          </>
        )}
      </div>
    </div>
  );
}
