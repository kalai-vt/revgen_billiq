import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { AuthLayout } from '@/features/auth/components/AuthLayout';

export function SignedOutPage() {
  return (
    <AuthLayout>
      <Card className="w-full max-w-sm">
        <CardHeader className="justify-items-center gap-3 text-center">
          <BrandLogo size="lg" />
          <CheckCircle2 className="size-8 text-primary" />
          <div className="space-y-1.5">
            <CardTitle className="text-xl">You have been signed out successfully</CardTitle>
            <CardDescription>Thanks for using RevGen BillIQ. Come back anytime.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button className="w-full" nativeButton={false} render={<Link to="/login">Sign In Again</Link>} />
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
