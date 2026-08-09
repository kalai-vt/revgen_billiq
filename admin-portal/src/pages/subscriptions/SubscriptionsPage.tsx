import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@shared/components/ui/tabs';
import { listSubscriptions, type SubscriptionStatusFilter } from '@/services/subscriptionsApi';
import { planLabel } from '@/lib/plans';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'outline'> = {
  active: 'default',
  trialing: 'outline',
  suspended: 'destructive',
  expired: 'destructive',
  cancelled: 'destructive',
};

const STATUS_FILTERS: { value: SubscriptionStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'trial', label: 'Trial' },
  { value: 'expiring_soon', label: 'Expiring soon' },
  { value: 'expired', label: 'Expired' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'active', label: 'Active' },
];

function daysRemainingLabel(days: number | null): string {
  if (days === null || days === undefined) return '—';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  return `${days}d`;
}

function daysRemainingClass(days: number | null): string {
  if (days === null || days === undefined) return '';
  if (days <= 3) return 'text-destructive font-medium';
  if (days <= 7) return 'text-amber-600 dark:text-amber-400 font-medium';
  return '';
}

export function SubscriptionsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatusFilter>('all');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-subscriptions', statusFilter],
    queryFn: () => listSubscriptions(statusFilter),
  });

  const mrr = data?.reduce((sum, row) => (row.subscription_status === 'active' ? sum + row.price_inr : sum), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.length} customers · ${formatCurrency(mrr)} MRR from active subscriptions` : 'Plan and billing status across every customer.'}
        </p>
      </div>

      <Tabs value={statusFilter} onValueChange={(value) => value && setStatusFilter(value as SubscriptionStatusFilter)}>
        <TabsList>
          {STATUS_FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading || !data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">No customers match this filter.</div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trial start</TableHead>
                <TableHead>Trial end</TableHead>
                <TableHead>Days remaining</TableHead>
                <TableHead>Last reminder</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.tenant_id} className="cursor-pointer" onClick={() => navigate(`/customers/${row.tenant_id}`)}>
                  <TableCell className="font-medium">{row.company_name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.owner_email}</TableCell>
                  <TableCell>
                    {planLabel(row.plan)}
                    <span className="ml-1.5 text-xs text-muted-foreground">{formatCurrency(row.price_inr)}/mo</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.subscription_status] ?? 'outline'} className="capitalize">
                      {row.subscription_status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(row.trial_started_at)}</TableCell>
                  <TableCell>{formatDate(row.trial_ends_at)}</TableCell>
                  <TableCell className={`tabular-nums ${daysRemainingClass(row.days_remaining)}`}>{daysRemainingLabel(row.days_remaining)}</TableCell>
                  <TableCell>{formatDate(row.last_reminder_sent_at)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/customers/${row.tenant_id}`)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
