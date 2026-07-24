import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { forgotPassword } from '@/features/auth/api';
import { AuthLayout } from '@/features/auth/components/AuthLayout';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
    } finally {
      // Always show the same generic confirmation, whether or not the email exists,
      // so this endpoint can't be used to enumerate registered accounts.
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Forgot password</CardTitle>
          <CardDescription>Enter your email and we'll send you a reset link.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {submitted ? (
            <p className="text-sm text-muted-foreground">
              If an account exists for this email, a password reset link has been sent.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Email</Label>
                <Input id="forgot-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
          )}
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
