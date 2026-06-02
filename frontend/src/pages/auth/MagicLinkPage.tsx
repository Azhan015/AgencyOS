/**
 * MagicLinkPage — handles /auth/magic?token=<token>
 *
 * Completely isolated from LoginPage so there's no interference from
 * RequireGuest guards, form state, or other login logic.
 * Reads the token from the URL, calls the verify endpoint, stores the
 * result in the auth store, and navigates to /dashboard.
 *
 * Uses the relative /api/v1 path so it works through both the Vite dev
 * proxy (localhost:5173 → localhost:5000) and the nginx Docker proxy
 * (localhost:3000 → backend:5000) without any extra configuration.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

function normalizeUser(user: Record<string, unknown>) {
  return {
    id: String(user.id ?? user._id ?? ''),
    email: String(user.email ?? ''),
    name: String(user.name ?? 'User'),
    role: String(user.role ?? 'CLIENT'),
    orgRole: user.orgRole ? String(user.orgRole) : undefined,
    organizationId: user.organizationId ? String(user.organizationId) : undefined,
    clientId: user.clientId ? String(user.clientId) : undefined,
    avatar: typeof user.avatar === 'string' ? user.avatar : undefined,
  };
}

export function MagicLinkPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const called = useRef(false); // prevent double-call in React StrictMode

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setErrorMsg('No token found in the link. Please use the link from your email.');
      return;
    }

    // Use relative path — works through Vite proxy (dev) and nginx proxy (Docker)
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
        setStatus('success');
        toast.success('Signed in successfully!');
        navigate('/dashboard', { replace: true });
      })
      .catch((err: Error) => {
        setStatus('error');
        const msg = err.message || 'This magic link is invalid or has expired.';
        setErrorMsg(msg);
        toast.error(msg);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-sm">
        {status === 'verifying' && (
          <>
            <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-medium">Signing you in…</p>
            <p className="text-muted-foreground text-sm mt-1">Please wait a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-medium">Signed in! Redirecting…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-lg font-medium text-destructive">Link invalid or expired</p>
            <p className="text-muted-foreground text-sm mt-1 mb-6">{errorMsg}</p>
            <div className="space-y-3">
              <Link to="/auth/login">
                <Button className="w-full">Back to sign in</Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                Magic links expire after 72 hours and can only be used once.
                Request a new one from the sign-in page.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
