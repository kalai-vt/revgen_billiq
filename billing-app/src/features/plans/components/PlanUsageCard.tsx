import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import * as plansApi from '@/features/plans/api';
import type { SubscriptionStatus } from '@/features/plans/api';
import { openRazorpayCheckout, RazorpayDismissedError } from '@/lib/razorpay';
import { ApiError } from '@/lib/api-client';

const PAYABLE_STATUSES: SubscriptionStatus[] = ['trialing', 'suspended', 'expired'];

const STATUS_BADGE: Record<SubscriptionStatus, { label: string; className: string }> = {
  trialing: { label: 'Trialing', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  active: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  suspended: { label: 'Suspended', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  expired: { label: 'Expired', className: 'bg-destructive/10 text-destructive' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
};

function UsageTile({ label, used, limit }: { label: string; used: number | null; limit: number | null }) {
  const percent = limit && used !== null ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="space-y-1.5 rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">
        {used === null ? 'Not tracked yet' : limit === null ? `${used.toLocaleString()} · Unlimited` : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
      </p>
      {limit !== null && used !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${percent >= 90 ? 'bg-destructive' : 'bg-primary'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function PlanUsageCard() {
  const queryClient = useQueryClient();
  const { data: usage, isLoading } = useQuery({ queryKey: ['billing-usage'], queryFn: plansApi.getUsage });

  const payMutation = useMutation({
    mutationFn: async () => {
      const order = await plansApi.createCheckoutOrder();
      const payment = await openRazorpayCheckout({
        keyId: order.razorpay_key_id,
        amountInr: order.amount_inr,
        orderId: order.order_id,
        description: `${order.plan_label} plan`,
      });
      return plansApi.verifyPayment({
        razorpay_order_id: payment.razorpay_order_id,
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_signature: payment.razorpay_signature,
      });
    },
    onSuccess: () => {
      toast.success('Payment received — your subscription is active.');
      queryClient.invalidateQueries({ queryKey: ['billing-usage'] });
    },
    onError: (err) => {
      if (err instanceof RazorpayDismissedError) return;
      toast.error(err instanceof ApiError ? err.message : 'Payment failed. Please try again.');
    },
  });

  if (isLoading || !usage) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const status = STATUS_BADGE[usage.subscription_status] ?? STATUS_BADGE.active;
  const renewalDate = new Date(usage.billing_cycle.end);
  renewalDate.setDate(renewalDate.getDate() - 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <Badge>{usage.label} plan</Badge>
          <span className="text-xs text-muted-foreground">Assigned by administrator</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Status: </span>
          <Badge variant="outline" className={status.className}>
            {status.label}
          </Badge>
        </div>
        {PAYABLE_STATUSES.includes(usage.subscription_status) && (
          <Button size="sm" onClick={() => payMutation.mutate()} disabled={payMutation.isPending}>
            {payMutation.isPending ? 'Processing…' : `Pay ₹${usage.price_inr.toLocaleString()} now`}
          </Button>
        )}
        <div className="text-sm">
          <span className="text-muted-foreground">Billing cycle: </span>
          <span className="font-medium">
            {new Date(usage.billing_cycle.start).toLocaleDateString()} – {renewalDate.toLocaleDateString()}
          </span>
        </div>
        {usage.subscription_status === 'trialing' && usage.trial_ends_at && (
          <div className="text-sm">
            <span className="text-muted-foreground">Trial ends: </span>
            <span className="font-medium">{new Date(usage.trial_ends_at).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <UsageTile label="Customers" used={usage.usage.customers.used} limit={usage.usage.customers.limit} />
        <UsageTile label="Products" used={usage.usage.products.used} limit={usage.usage.products.limit} />
        <UsageTile label="Team members" used={usage.usage.users.used} limit={usage.usage.users.limit} />
        <UsageTile label="Invoices this month" used={usage.usage.monthly_invoices.used} limit={usage.usage.monthly_invoices.limit} />
        <UsageTile label="Branches" used={usage.usage.branches.used} limit={usage.usage.branches.limit} />
        <UsageTile label="Warehouses" used={usage.usage.warehouses.used} limit={usage.usage.warehouses.limit} />
        <UsageTile label="Storage (MB)" used={usage.usage.storage.used} limit={usage.usage.storage.limit} />
      </div>

      <p className="text-xs text-muted-foreground">
        Subscription plans are managed by your administrator. Please contact support if you require plan changes.
      </p>
    </div>
  );
}
