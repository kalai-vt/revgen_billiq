import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExportDropdown, type ExportFormat } from '@/components/shared/ExportDropdown';
import { IconButton } from '@/components/ui/icon-button';
import * as analyticsApi from '@/features/analytics/api';
import type { ComparisonUnit } from '@/features/analytics/api';
import { ComparisonMetricCard } from '@/features/analytics/components/ComparisonMetricCard';
import { useFeatureFlags } from '@/features/settings/hooks/useFeatureFlags';
import { useTrendComparison } from '@/features/analytics/hooks/useTrendComparison';
import { downloadBlob } from '@/lib/download-blob';

const UNIT_OPTIONS: { value: ComparisonUnit; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

const METRIC_FORMATS: Record<string, 'currency' | 'number'> = {
  revenue: 'currency',
  orders: 'number',
  customers: 'number',
  average_order_value: 'currency',
  products_sold: 'number',
};

export function TrendComparisonPage() {
  const { data: featureFlags } = useFeatureFlags();
  const canUseTrendComparison = featureFlags?.trend_comparison ?? false;
  const [unit, setUnit] = useState<ComparisonUnit>('month');
  const { data, isLoading, isFetching, refetch } = useTrendComparison(unit);

  if (!canUseTrendComparison) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Trend Comparison</h1>
        <p className="text-sm text-muted-foreground">
          Period-over-period performance comparison is available on the Explore plan and above.
        </p>
        <Button nativeButton={false} render={<Link to="/pricing">View plans</Link>} />
      </div>
    );
  }

  async function handleExport(format: ExportFormat) {
    const blob = await analyticsApi.exportTrendComparison(unit, format);
    downloadBlob(blob, `trend_comparison_${unit}.${format === 'excel' ? 'xlsx' : format}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trend Comparison</h1>
          <p className="text-sm text-muted-foreground">Compare current performance against the previous period.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Tabs value={unit} onValueChange={(value) => setUnit(value as ComparisonUnit)}>
            <TabsList>
              {UNIT_OPTIONS.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <IconButton
            tooltip="Refresh"
            variant="outline"
            className="size-8"
            aria-label="Refresh comparison"
            onClick={() => refetch()}
          >
            <RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />
          </IconButton>
          <ExportDropdown label="Export" onExport={handleExport} />
          <IconButton tooltip="Print" variant="outline" className="size-8" aria-label="Print comparison" onClick={() => window.print()}>
            <Printer className="size-4" />
          </IconButton>
        </div>
      </div>

      {data && (
        <p className="text-sm font-medium text-muted-foreground">
          {data.current_label} vs {data.previous_label}
        </p>
      )}

      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : data.metrics.length === 0 ? (
        <EmptyState title="No data available for comparison" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.metrics.map((metric) => (
            <ComparisonMetricCard key={metric.key} metric={metric} format={METRIC_FORMATS[metric.key] ?? 'number'} />
          ))}
        </div>
      )}
    </div>
  );
}
