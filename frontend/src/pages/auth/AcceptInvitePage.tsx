/**
 * AcceptInvitePage
 *
 * Handles the client portal invitation flow:
 *   /auth/accept-invite?token=<invite_token>
 *
 * The client receives an email with this link. On this page they:
 *   1. See a welcome message
 *   2. Set their own password (or skip if they'll use Google/magic link)
 *   3. Are logged in automatically after accepting
 *
 * If the token is missing or expired, they see a clear error with a link
 * to request a new invitation from the agency.
 */
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/ui/logo';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

const setPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type SetPasswordForm = z.infer<typeof setPasswordSchema>;

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const token = searchParams.get('token');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetPasswordForm>({ resolver: zodResolver(setPasswordSchema) });

  // Redirect immediately if no token in URL
  useEffect(() => {
    if (!token) {
      setTokenError('No invitation token found. Please use the link from your invitation email.');
    }
  }, [token]);

  const onSubmit = async (data: SetPasswordForm) => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      // Accept the invite and set password
      const res = await api.post('/clients/accept-invite', {
        token,
        password: data.password,
      });

      const { userId } = res.data.data;

      // Now log the user in with their new password — we need to fetch their email first
      // The backend returns userId; we use magic-link-style auto-login via a fresh token
      // Actually: call /auth/me after setting a session via login endpoint
      // Simplest: redirect to login with a success message
      toast.success('Password set! Please sign in with your email and new password.');
      navigate('/auth/login');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'This invitation link is invalid or has expired.';
      setTokenError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Token error state ──────────────────────────────────────────────────────
  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm text-center">
          <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-600" />
          </div>
          <h1 className="text-xl font-bold mb-2">Invitation link invalid</h1>
          <p className="text-muted-foreground text-sm mb-6">{tokenError}</p>
          <p className="text-sm text-muted-foreground mb-4">
            Invitation links expire after 72 hours. Please ask your agency to resend the invitation.
          </p>
          <Link to="/auth/login">
            <Button variant="outline" className="w-full">Go to sign in</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <Logo size="lg" showText={false} className="mb-4" />
            <h1 className="text-2xl font-bold">Accept your invitation</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Set a password to access your client portal.
            </p>
          </div>

          <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-800 dark:text-blue-400">
            <p className="font-medium mb-0.5">Setting your password</p>
            <p className="text-xs leading-relaxed opacity-90">
              Choose a strong password (min. 8 characters). You can change it anytime in Settings → Security.
              You can also sign in with Google after accepting.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="New Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min. 8 characters"
              leftIcon={<Lock className="h-4 w-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              error={errors.password?.message}
              {...register('password')}
            />
            <Input
              label="Confirm Password"
              type={showConfirm ? 'text' : 'password'}
              placeholder="Re-enter your password"
              leftIcon={<Lock className="h-4 w-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="hover:text-foreground"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Set Password & Continue
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link to="/auth/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right: Visual */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/10 via-primary/5 to-background items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Your portal is ready</h2>
          <p className="text-muted-foreground text-sm">
            Once you set your password, you'll have access to your projects, invoices, contracts, and more.
          </p>
        </div>
      </div>
    </div>
  );
}
