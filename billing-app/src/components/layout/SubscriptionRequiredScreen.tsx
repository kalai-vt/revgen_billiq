import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { PageMeta } from '@/components/PageMeta';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as plansApi from '@/features/plans/api';
import { usePaySubscription } from '@/features/plans/hooks/usePaySubscription';
import type { SubscriptionBlockInfo } from '@/lib/subscriptionGateStore';

const FALLBACK_MESSAGE = 'Your trial has ended. Please subscribe to continue using BillIQ.';

interface SubscriptionRequiredScreenProps {
  info: SubscriptionBlockInfo | null;
}

/**
 * Full-screen access gate rendered by AppShell (see AppShell.tsx) in place of the entire app —
 * sidebar, header, and routed page content included — whenever the tenant's subscription is
 * blocking normal usage (trial expired, or admin-suspended/expired/cancelled). It is purely an
 * access gate: it fetches nothing beyond GET /api/billing/usage (needed for the price/plan shown
 * on the pay action, and itself exempt from this same enforcement so it always resolves even
 * while blocked) and shows no customer data whatsoever.
 *
 * The "message" shown is whatever the backend sent on the 402 (`info.message`), falling back to
 * the spec's exact copy if this screen is reached proactively (via AppShell's own subscription
 * check on load) rather than reactively from a 402.
 */
export function SubscriptionRequiredScreen({ info }: SubscriptionRequiredScreenProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { data: usage } = useQuery({ queryKey: ['billing-usage'], queryFn: plansApi.getUsage });
  const payMutation = usePaySubscription();

  async function handleSignOut() {
    await logout();
    navigate('/signed-out');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <PageMeta
        title="Subscription required — RevGen BillIQ"
        description="Your BillIQ subscription needs attention before you can continue."
      />
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-4 text-center">
          <BrandLogo logoUrl={null} size="md" />
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold tracking-tight">Subscription required</h1>
            <p className="text-sm text-muted-foreground">{info?.message || FALLBACK_MESSAGE}</p>
          </div>

          {usage && (
            <Button className="w-full" onClick={() => payMutation.mutate()} disabled={payMutation.isPending}>
              {payMutation.isPending ? 'Processing…' : `Pay ₹${usage.price_inr.toLocaleString()} now`}
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            Subscription plans are managed by your administrator. Contact your administrator if you're not able to
            complete payment yourself.
          </p>

          <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
