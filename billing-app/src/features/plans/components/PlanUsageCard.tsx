import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import * as plansApi from '@/features/plans/api';
import { PLANS, PLAN_ORDER } from '@/features/plans/lib/planConfig';
import * as settingsApi from '@/features/settings/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { PlanId } from '@/features/auth/api';
import { ApiError } from '@/lib/api-client';

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {used.toLocaleString()} / {limit === null ? 'Unlimited' : limit.toLocaleString()}
        </span>
      </div>
      {limit !== null && (
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
  const { setPlan } = useAuth();
  const queryClient = useQueryClient();
  const { data: usage, isLoading } = useQuery({ queryKey: ['billing-usage'], queryFn: plansApi.getUsage });

  const switchPlanMutation = useMutation({
    mutationFn: (plan: PlanId) => settingsApi.updateSettings({ plan }),
    onSuccess: (updated) => {
      setPlan(updated.plan);
      queryClient.invalidateQueries({ queryKey: ['billing-usage'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(`Switched to the ${PLANS[updated.plan].label} plan`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not switch plan'),
  });

  if (isLoading || !usage) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge>{usage.label} plan</Badge>
          <span className="text-sm text-muted-foreground">₹{usage.price_inr.toLocaleString()}/month</span>
        </div>
        <Select
          value={usage.plan}
          onValueChange={(value) => switchPlanMutation.mutate(value as PlanId)}
          disabled={switchPlanMutation.isPending}
        >
          <SelectTrigger className="w-48">
            <SelectValue>{(value: string | null) => PLANS[(value as PlanId) ?? 'basic'].label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PLAN_ORDER.map((planId) => (
              <SelectItem key={planId} value={planId}>
                {PLANS[planId].label} — ₹{PLANS[planId].priceInr}/month
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <UsageRow label="Products" used={usage.usage.products.used} limit={usage.usage.products.limit} />
        <UsageRow label="Customers" used={usage.usage.customers.used} limit={usage.usage.customers.limit} />
        <UsageRow label="Team members" used={usage.usage.users.used} limit={usage.usage.users.limit} />
        <UsageRow
          label="Invoices this month"
          used={usage.usage.monthly_invoices.used}
          limit={usage.usage.monthly_invoices.limit}
        />
      </div>
    </div>
  );
}
