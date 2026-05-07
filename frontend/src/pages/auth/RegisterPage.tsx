import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, User, AlertCircle, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRegister } from '@/hooks/useAuth';
import { Logo } from '@/components/ui/logo';
import axios from 'axios';

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

// Google "G" icon SVG
function GoogleIcon() {
  return (
    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

type RegistrationStatus = 'loading' | 'open' | 'locked';

export function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus>('loading');
  const register = useRegister();

  const { register: formRegister, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  // Check whether registration is open before rendering the form
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    axios
      .get(`${apiUrl}/auth/registration-status`)
      .then((res) => {
        setRegistrationStatus(res.data?.data?.open ? 'open' : 'locked');
      })
      .catch(() => {
        // If the check fails (network error, server down), default to showing
        // the form — the server will reject the request if registration is locked.
        setRegistrationStatus('open');
      });
  }, []);

  const onSubmit = (data: RegisterForm) => {
    setRegisterError(null);
    register.mutate(
      { name: data.name, email: data.email, password: data.password },
      {
        onError: (error: unknown) => {
          const status = (error as { response?: { status?: number } })?.response?.status;
          const msg =
            (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data
              ?.error?.message;

          if (status === 403) {
            // Registration is locked — update UI state
            setRegistrationStatus('locked');
          } else if (status === 409) {
            setRegisterError(
              'An account with this email already exists. If you signed up with Google, please use "Continue with Google" to sign in. Otherwise, go to the sign-in page.'
            );
          } else {
            setRegisterError(msg || 'Registration failed. Please try again.');
          }
        },
      }
    );
  };

  // Google OAuth — pass current origin so backend redirects back to the right port
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
  const currentOrigin = window.location.origin;
  const googleAuthUrl = `${backendUrl}/api/v1/auth/google?origin=${encodeURIComponent(currentOrigin)}`;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (registrationStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">Checking setup status…</div>
      </div>
    );
  }

  // ── Registration locked ────────────────────────────────────────────────────
  if (registrationStatus === 'locked') {
    return (
      <div className="min-h-screen flex">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-sm text-center">
            <Logo size="lg" showText={false} className="mb-6 mx-auto" />
            <div className="flex items-center justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <ShieldOff className="h-8 w-8 text-muted-foreground" />
              </div>
            </div>
            <h1 className="text-2xl font-bold mb-2">Registration is closed</h1>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
              This agency already has an admin account. New team members and clients
              are added by the administrator through the admin dashboard — not through
              this page.
            </p>
            <p className="text-muted-foreground text-sm mb-8">
              If you were invited, check your email for a sign-in link.
            </p>
            <Button asChild className="w-full">
              <Link to="/auth/login">Go to sign in</Link>
            </Button>
          </div>
        </div>

        {/* Right: Visual */}
        <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/10 via-primary/5 to-background items-center justify-center p-12">
          <div className="max-w-md text-center">
            <h2 className="text-xl font-semibold mb-2">Your agency, unified</h2>
            <p className="text-muted-foreground text-sm">
              Projects, invoices, files, and client communication — all in one place.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Registration open (first-time setup) ──────────────────────────────────
  return (
    <div className="min-h-screen flex">
      {/* Left: Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-8">
            <Logo size="lg" showText={false} className="mb-4" />
            <h1 className="text-2xl font-bold">Create your account</h1>
            <p className="text-muted-foreground mt-1">Initial agency admin setup</p>
          </div>

          {/* Admin-only notice */}
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
            <p className="font-medium mb-0.5">First-time setup — agency owner only</p>
            <p className="text-xs leading-relaxed opacity-90">
              This creates the initial superadmin account. Once created, registration
              is locked. Team members and clients are added by you through the admin
              dashboard after setup.
            </p>
          </div>

          {/* On-screen error banner */}
          {registerError && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{registerError}</span>
            </div>
          )}

          {/* Google sign-up option */}
          <Button
            type="button"
            variant="outline"
            className="w-full mb-4"
            onClick={() => { window.location.href = googleAuthUrl; }}
          >
            <GoogleIcon />
            Continue with Google
          </Button>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or register with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Full Name"
              type="text"
              placeholder="Jane Smith"
              leftIcon={<User className="h-4 w-4" />}
              error={errors.name?.message}
              {...formRegister('name')}
            />
            <Input
              label="Email"
              type="email"
              placeholder="you@company.com"
              leftIcon={<Mail className="h-4 w-4" />}
              error={errors.email?.message}
              {...formRegister('email')}
            />
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min. 8 characters"
              leftIcon={<Lock className="h-4 w-4" />}
              rightIcon={
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              error={errors.password?.message}
              {...formRegister('password')}
            />
            <Input
              label="Confirm Password"
              type={showConfirm ? 'text' : 'password'}
              placeholder="Re-enter your password"
              leftIcon={<Lock className="h-4 w-4" />}
              rightIcon={
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="hover:text-foreground">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              error={errors.confirmPassword?.message}
              {...formRegister('confirmPassword')}
            />

            <Button type="submit" className="w-full" loading={register.isPending}>
              Create superadmin account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/auth/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right: Visual */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/10 via-primary/5 to-background items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="grid grid-cols-2 gap-4 mb-8">
            {[
              { label: 'Active Projects', value: '24', color: 'bg-blue-500' },
              { label: 'Revenue This Month', value: '$48k', color: 'bg-emerald-500' },
              { label: 'Pending Approvals', value: '7', color: 'bg-amber-500' },
              { label: 'Client NPS', value: '72', color: 'bg-violet-500' },
            ].map((stat) => (
              <div key={stat.label} className="bg-card border rounded-xl p-4 text-left shadow-sm">
                <div className={`h-2 w-8 rounded-full ${stat.color} mb-3`} />
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
          <h2 className="text-xl font-semibold mb-2">Your agency, unified</h2>
          <p className="text-muted-foreground text-sm">
            Projects, invoices, files, and client communication — all in one place.
          </p>
        </div>
      </div>
    </div>
  );
}
