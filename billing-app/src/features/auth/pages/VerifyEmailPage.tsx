import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CircleCheckIcon, ClockIcon, XCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { verifyEmail } from '@/features/auth/api';
import { ApiError } from '@/lib/api-client';
import { AuthLayout } from '@/features/auth/components/AuthLayout';

type Status = 'loading' | 'success' | 'expired' | 'failed';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('loading');
  // Verification tokens are single-use, so this call must fire exactly once even under
  // React StrictMode's dev-only double-invocation of effects.
  const requested = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('failed');
      return;
    }
    if (requested.current) return;
    requested.current = true;

    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        if (err instanceof ApiError && err.message.toLowerCase().includes('expired')) {
          setStatus('expired');
        } else {
          setStatus('failed');
        }
      });
  }, [token]);

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm">
        {status === 'loading' && (
          <CardHeader>
            <CardTitle className="text-xl">Verifying your email…</CardTitle>
            <CardDescription>Please wait a moment.</CardDescription>
          </CardHeader>
        )}

        {status === 'success' && (
          <>
            <CardHeader>
              <CircleCheckIcon className="mb-2 size-8 text-primary" />
              <CardTitle className="text-xl">Email verified</CardTitle>
              <CardDescription>Your account is now active. You can sign in.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => navigate('/login')}>
                Continue to login
              </Button>
            </CardContent>
          </>
        )}

        {status === 'expired' && (
          <>
            <CardHeader>
              <ClockIcon className="mb-2 size-8 text-muted-foreground" />
              <CardTitle className="text-xl">Link expired</CardTitle>
              <CardDescription>
                This verification link has expired. Sign in to request a new one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={() => navigate('/login')}>
                Back to login
              </Button>
            </CardContent>
          </>
        )}

        {status === 'failed' && (
          <>
            <CardHeader>
              <XCircleIcon className="mb-2 size-8 text-destructive" />
              <CardTitle className="text-xl">Invalid link</CardTitle>
              <CardDescription>This verification link is invalid or has already been used.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={() => navigate('/login')}>
                Back to login
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </AuthLayout>
  );
}
