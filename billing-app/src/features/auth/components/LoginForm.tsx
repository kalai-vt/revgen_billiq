import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import { resendVerification } from '@/features/auth/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/lib/api-client';

const REMEMBERED_EMAIL_KEY = 'revgeniq_remembered_email';

// Login only needs "did you fill this in correctly" checks — no password-complexity
// re-validation here, that's the server's job when checking credentials.
const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
  const [rememberMe, setRememberMe] = useState(!!rememberedEmail);
  const [error, setError] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [resending, setResending] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: rememberedEmail ?? '',
      password: '',
    },
  });

  async function onSubmit(values: LoginFormValues) {
    setError(null);
    setShowResend(false);
    setLoading(true);
    try {
      await login(values.email, values.password, rememberMe);
      if (rememberMe) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, values.email);
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setShowResend(err.status === 403);
      } else {
        setError('Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      await resendVerification(getValues('email'));
      toast.success('Verification email sent. Please check your inbox.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link to="/forgot-password" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>
        <PasswordInput id="password" autoComplete="current-password" {...register('password')} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="remember-me" checked={rememberMe} onCheckedChange={setRememberMe} />
        <Label htmlFor="remember-me" className="font-normal">
          Remember me
        </Label>
      </div>
      {error && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          {showResend && (
            <Button type="button" variant="outline" size="sm" onClick={handleResend} disabled={resending}>
              {resending ? 'Sending…' : 'Resend verification email'}
            </Button>
          )}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
