import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { BrandLogo } from '@/components/shared/BrandLogo';
import * as settingsApi from '@/features/settings/api';
import { DailySalesChart } from '@/features/analytics/components/DailySalesChart';
import { KpiCards } from '@/features/analytics/components/KpiCards';
import { PaymentMethodsChart } from '@/features/analytics/components/PaymentMethodsChart';
import { RecentInvoicesTable } from '@/features/analytics/components/RecentInvoicesTable';
import { TopProductsChart } from '@/features/analytics/components/TopProductsChart';
import { TopProductsTable } from '@/features/analytics/components/TopProductsTable';
import { useDashboardData } from '@/features/analytics/hooks/useDashboardData';

const DASHBOARD_RANGE_DAYS = 7;

export function DashboardPage() {
  const { data, isLoading } = useDashboardData(DASHBOARD_RANGE_DAYS);
  const { data: branding } = useQuery({ queryKey: ['branding'], queryFn: settingsApi.getBranding });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">Today's snapshot at a glance.</p>
        </div>
        <BrandLogo logoUrl={branding?.logo_url} size="md" />
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
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
