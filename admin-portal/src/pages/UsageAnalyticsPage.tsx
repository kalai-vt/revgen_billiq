import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/components/ui/table';
import { cn } from '@/lib/utils';
import { listUsageAnalytics, type ResourceUsage } from '@/services/usageApi';

function UsageCell({ usage }: { usage: ResourceUsage }) {
  const pct = usage.pct_used;
  return (
    <div className="min-w-24">
      <div className="flex items-center justify-between text-xs tabular-nums">
        <span>
          {usage.used}
          {usage.limit !== null ? ` / ${usage.limit}` : ''}
        </span>
        {pct !== null && <span className="text-muted-foreground">{pct}%</span>}
      </div>
      {pct !== null && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full', pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-amber-500' : 'bg-primary')}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function UsageAnalyticsPage() {
  const navigate = useNavigate();
  const [onlyAtRisk, setOnlyAtRisk] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-usage-analytics', onlyAtRisk],
    queryFn: () => listUsageAnalytics(onlyAtRisk),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usage Analytics</h1>
          <p className="text-sm text-muted-foreground">How close each customer is to their plan limits.</p>
        </div>
        <Button variant={onlyAtRisk ? 'default' : 'outline'} size="sm" onClick={() => setOnlyAtRisk((v) => !v)}>
          {onlyAtRisk ? 'Showing at-risk only' : 'Show at-risk only'}
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Customers</TableHead>
                <TableHead>Monthly invoices</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No customers at risk right now.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row) => (
                  <TableRow key={row.tenant_id} className="cursor-pointer" onClick={() => navigate(`/customers/${row.tenant_id}`)}>
                    <TableCell className="font-medium">{row.company_name}</TableCell>
                    <TableCell className="capitalize">{row.plan}</TableCell>
                    <TableCell>
                      <UsageCell usage={row.users} />
                    </TableCell>
                    <TableCell>
                      <UsageCell usage={row.products} />
                    </TableCell>
                    <TableCell>
                      <UsageCell usage={row.customers} />
                    </TableCell>
                    <TableCell>
                      <UsageCell usage={row.monthly_invoices} />
                    </TableCell>
                    <TableCell>
                      {row.at_risk ? (
                        <Badge variant="destructive">At risk</Badge>
                      ) : (
                        <Badge variant="outline">Healthy</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
