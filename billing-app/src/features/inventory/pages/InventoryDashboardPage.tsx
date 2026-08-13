import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { InventoryKpiCards } from '@/features/inventory/components/InventoryKpiCards';
import { RecentlyUpdatedTable } from '@/features/inventory/components/RecentlyUpdatedTable';
import { useInventoryDashboard } from '@/features/inventory/hooks/useInventoryDashboard';
import { apiErrorMessage } from '@/lib/query-error';

export function InventoryDashboardPage() {
  const { data, isLoading, error } = useInventoryDashboard();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory Overview</h1>
        <p className="text-sm text-muted-foreground">Stock levels at a glance.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : error || !data ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load the inventory overview"
          description={apiErrorMessage(error, 'Something went wrong loading the dashboard.')}
        />
      ) : (
        <>
          <InventoryKpiCards dashboard={data} />
          <RecentlyUpdatedTable items={data.recently_updated} />
        </>
      )}
    </div>
  );
}
