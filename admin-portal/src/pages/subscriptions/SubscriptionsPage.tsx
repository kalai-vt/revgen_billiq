import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@shared/components/ui/badge';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/components/ui/table';
import { listSubscriptions } from '@/services/subscriptionsApi';

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

export function SubscriptionsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['admin-subscriptions'], queryFn: listSubscriptions });

  const mrr = data?.reduce((sum, row) => (row.subscription_status === 'active' ? sum + row.price_inr : sum), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.length} customers · ${formatCurrency(mrr)} MRR from active subscriptions` : 'Plan and billing status across every customer.'}
        </p>
      </div>

      {isLoading || !data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trial ends</TableHead>
                <TableHead>Customer since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.tenant_id} className="cursor-pointer" onClick={() => navigate(`/customers/${row.tenant_id}`)}>
                  <TableCell className="font-medium">{row.company_name}</TableCell>
                  <TableCell className="capitalize">{row.plan}</TableCell>
                  <TableCell className="tabular-nums">{formatCurrency(row.price_inr)}/mo</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.subscription_status] ?? 'outline'} className="capitalize">
                      {row.subscription_status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(row.trial_ends_at)}</TableCell>
                  <TableCell>{formatDate(row.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
