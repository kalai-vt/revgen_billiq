import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { DateRangeSelector } from '@/components/shared/DateRangeSelector';
import { IconButton } from '@/components/ui/icon-button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ProcurementKpiCards } from '@/features/procurement/components/ProcurementKpiCards';
import { TopVendorsChart } from '@/features/procurement/components/TopVendorsChart';
import { useProcurementDashboardData } from '@/features/procurement/hooks/useProcurementDashboardData';
import { resolveDateRangePreset, OVERVIEW_PRESETS } from '@/lib/date-range';

export function ProcurementDashboardPage() {
  const { tenant } = useAuth();
  const timezone = tenant?.timezone ?? 'UTC';
  const [range, setRange] = useState(() => resolveDateRangePreset('this_month', timezone));
  const { data, isLoading, isFetching, refetch } = useProcurementDashboardData(range);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Procurement Dashboard</h1>
          <p className="text-sm text-muted-foreground">Purchases, vendors, and outstanding payables at a glance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeSelector value={range} onChange={setRange} timezone={timezone} presets={OVERVIEW_PRESETS} />
          <IconButton tooltip="Refresh" variant="outline" className="size-8" aria-label="Refresh dashboard" onClick={() => refetch()}>
            <RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />
          </IconButton>
        </div>
      </div>

      <ProcurementKpiCards kpis={data?.kpis} isLoading={isLoading} />

      <div className="grid gap-4 lg:grid-cols-2">
        <TopVendorsChart data={data?.top_vendors ?? []} isLoading={isLoading} />
        <div className="rounded-md border p-4 text-sm">
          <p className="mb-3 font-medium">Selected period</p>
          <div className="space-y-1.5 text-muted-foreground">
            <div className="flex justify-between">
              <span>Purchases in range</span>
              <span className="font-medium text-foreground">{data?.kpis.range_purchase_count ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Purchase value in range</span>
              <span className="font-medium text-foreground">₹{(data?.kpis.range_purchase_value ?? 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
