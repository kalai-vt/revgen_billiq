import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { resendVerification } from '@/features/auth/api';
import { ApiError } from '@/lib/api-client';
import { AuthLayout } from '@/features/auth/components/AuthLayout';

export function CheckEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = (location.state as { email?: string } | null)?.email;
  const [loading, setLoading] = useState(false);

  if (!email) {
    navigate('/login', { replace: true });
    return null;
  }

  async function handleResend() {
    setLoading(true);
    try {
      await resendVerification(email!);
      toast.success('Verification email sent. Please check your inbox.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Verify your email</CardTitle>
          <CardDescription>
            We sent a verification link to <span className="font-medium text-foreground">{email}</span>. Click the
            link to activate your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" variant="outline" onClick={handleResend} disabled={loading}>
            {loading ? 'Sending…' : 'Resend email'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Back to login
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
