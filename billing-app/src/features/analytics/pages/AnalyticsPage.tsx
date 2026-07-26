import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { hasFeature } from '@/features/plans/lib/planConfig';
import { DateRangeSelect } from '@/features/analytics/components/DateRangeSelect';
import { DailySalesChart } from '@/features/analytics/components/DailySalesChart';
import { KpiCards } from '@/features/analytics/components/KpiCards';
import { PaymentMethodsChart } from '@/features/analytics/components/PaymentMethodsChart';
import { RecentInvoicesTable } from '@/features/analytics/components/RecentInvoicesTable';
import { TopProductsChart } from '@/features/analytics/components/TopProductsChart';
import { TopProductsTable } from '@/features/analytics/components/TopProductsTable';
import { useDashboardData } from '@/features/analytics/hooks/useDashboardData';

export function AnalyticsPage() {
  const { plan } = useAuth();
  const [days, setDays] = useState(14);
  const canUseAdvanced = hasFeature(plan, 'advanced_analytics');
  const { data, isLoading } = useDashboardData(days, canUseAdvanced);

  if (!canUseAdvanced) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Advanced Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Date-range reporting is available on the Explore plan and above. Your Overview still shows today's
          snapshot.
        </p>
        <Button nativeButton={false} render={<Link to="/pricing">View plans</Link>} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Sales performance at a glance.</p>
        </div>
        <DateRangeSelect days={days} onChange={setDays} />
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <KpiCards kpis={data.kpis} />

          <div className="grid gap-4 lg:grid-cols-2">
            <DailySalesChart data={data.daily_sales} />
            <PaymentMethodsChart data={data.payment_methods} />
          </div>

          <TopProductsChart data={data.top_products} />

          <div className="grid gap-4 lg:grid-cols-2">
            <RecentInvoicesTable data={data.recent_invoices} />
            <TopProductsTable data={data.top_products} />
          </div>
        </>
      )}
    </div>
  );
}
