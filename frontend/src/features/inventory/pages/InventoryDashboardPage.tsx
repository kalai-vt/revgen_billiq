import { Skeleton } from '@/components/ui/skeleton';
import { InventoryKpiCards } from '@/features/inventory/components/InventoryKpiCards';
import { RecentlyUpdatedTable } from '@/features/inventory/components/RecentlyUpdatedTable';
import { useInventoryDashboard } from '@/features/inventory/hooks/useInventoryDashboard';

export function InventoryDashboardPage() {
  const { data, isLoading } = useInventoryDashboard();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory Overview</h1>
        <p className="text-sm text-muted-foreground">Stock levels at a glance.</p>
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <InventoryKpiCards dashboard={data} />
          <RecentlyUpdatedTable items={data.recently_updated} />
        </>
      )}
    </div>
  );
}
