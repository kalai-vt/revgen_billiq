import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { PageMeta } from '@/components/PageMeta';
import { AuthLayout } from '@/features/auth/components/AuthLayout';

export function LoginPage() {
  return (
    <AuthLayout>
      <PageMeta
        title="Sign In — RevGen BillIQ"
        description="Sign in to your RevGen BillIQ account to manage billing, inventory, and point-of-sale for your business."
      />
      <Card className="w-full max-w-sm">
        <CardHeader className="justify-items-center gap-3 text-center">
          <BrandLogo size="lg" />
          <CardDescription className="text-sm">Sign in to your organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginForm />
          <p className="text-center text-sm text-muted-foreground">
            New here?{' '}
            <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
              Start your 14-Day Free Trial
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
