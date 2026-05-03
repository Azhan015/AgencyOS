import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLogin, useMagicLink, useVerifyMagicLink } from '@/hooks/useAuth';
import { Logo } from '@/components/ui/logo';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [magicMode, setMagicMode] = useState(false);
  const [magicEmail, setMagicEmail] = useState('');
  const [searchParams] = useSearchParams();
  const magicToken = searchParams.get('token');

  const login = useLogin();
  const sendMagicLink = useMagicLink();
  const verifyMagicLink = useVerifyMagicLink();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  // Auto-verify magic link token from URL
  useEffect(() => {
    if (magicToken) {
      verifyMagicLink.mutate(magicToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magicToken]);

  const onSubmit = (data: LoginForm) => {
    login.mutate(data);
  };

  const handleMagicLink = () => {
    if (magicEmail) {
      sendMagicLink.mutate(magicEmail);
    }
  };

  if (magicToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Signing you in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-8">
            <Logo size="lg" showText={false} className="mb-4" />
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-muted-foreground mt-1">Sign in to your Agency OS portal</p>
          </div>

          {!magicMode ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="you@company.com"
                leftIcon={<Mail className="h-4 w-4" />}
                error={errors.email?.message}
                {...register('email')}
              />
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                leftIcon={<Lock className="h-4 w-4" />}
                rightIcon={
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="hover:text-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                error={errors.password?.message}
                {...register('password')}
              />

              <div className="flex justify-end">
                <Link to="/auth/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" className="w-full" loading={login.isPending}>
                Sign in
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setMagicMode(true)}
              >
                <Mail className="mr-2 h-4 w-4" />
                Sign in with magic link
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{' '}
                <Link to="/auth/register" className="text-primary hover:underline font-medium">
                  Create one
                </Link>
              </p>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter your email and we'll send you a magic link to sign in instantly.
                </p>
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@company.com"
                  leftIcon={<Mail className="h-4 w-4" />}
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleMagicLink}
                loading={sendMagicLink.isPending}
                disabled={!magicEmail}
              >
                Send magic link
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setMagicMode(false)}>
                Back to password login
              </Button>
            </div>
          )}
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
