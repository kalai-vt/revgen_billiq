import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import { resendVerification } from '@/features/auth/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/lib/api-client';

const REMEMBERED_EMAIL_KEY = 'revgeniq_remembered_email';

export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
  const [email, setEmail] = useState(rememberedEmail ?? '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(!!rememberedEmail);
  const [error, setError] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [resending, setResending] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setShowResend(false);
    setLoading(true);
    try {
      await login(email, password, rememberMe);
      if (rememberMe) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
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
      await resendVerification(email);
      toast.success('Verification email sent. Please check your inbox.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link to="/forgot-password" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
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
