import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RegisterForm } from '@/features/auth/components/RegisterForm';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { AuthLayout } from '@/features/auth/components/AuthLayout';

export function RegisterPage() {
  return (
    <AuthLayout>
      <Card className="w-full max-w-sm">
        <CardHeader className="justify-items-center gap-3 text-center">
          <BrandLogo size="lg" />
          <div className="space-y-1.5">
            <CardTitle className="text-xl">Create Your Free Trial Account</CardTitle>
            <CardDescription>Set up RevGen BillIQ for your business</CardDescription>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="size-3.5" />
            No credit card required · Full access for 14 days
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <RegisterForm />
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
