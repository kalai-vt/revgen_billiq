import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, LayoutGrid, RefreshCw, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ReleaseTableDialog } from '@/features/restaurant/components/ReleaseTableDialog';
import { useFeatureFlag } from '@/features/settings/hooks/useFeatureFlags';
import * as restaurantApi from '@/features/restaurant/api';
import type { TableWithOrder } from '@/features/restaurant/api';
import { ApiError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/query-error';
import { cn } from '@/lib/utils';
import { tableLabel } from '@/features/restaurant/lib/tableLabel';

/** Status colours for the floor board. Driven off the table's own status — which the server keeps
 * in step with the order sitting on it — rather than each screen deciding for itself what
 * "occupied" looks like. */
const STATUS_STYLES: Record<restaurantApi.TableStatus, string> = {
  available: 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950',
  occupied: 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950',
  reserved: 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950',
  billing: 'border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950',
  cleaning: 'border-muted bg-muted/40',
};

const STATUS_DOT: Record<restaurantApi.TableStatus, string> = {
  available: 'bg-emerald-500',
  occupied: 'bg-red-500',
  reserved: 'bg-amber-500',
  billing: 'bg-blue-500',
  cleaning: 'bg-muted-foreground/50',
};

/** The floor reads these, not the KOT lifecycle: what a server needs crossing the room is
 * whether the food is ready, not which ticket is in which state. */
const KITCHEN_STATE_LABELS: Record<'sent' | 'preparing' | 'ready' | 'served', string> = {
  sent: 'Sent to kitchen',
  preparing: 'Preparing',
  ready: 'Food ready',
  served: 'Served',
};

function TableCard({
  table,
  onSelect,
  onRelease,
  canRelease,
  isBusy,
}: {
  table: TableWithOrder;
  onSelect: () => void;
  onRelease: () => void;
  canRelease: boolean;
  isBusy: boolean;
}) {
  // Only offered when there is an occupancy to release — on a free table the button would have
  // nothing to do, and an X on every card invites mis-clicks.
  const releasable = canRelease && table.status !== 'available';

  return (
    <div className="relative">
      {releasable && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Release ${tableLabel(table.name)}`}
                className="absolute right-1.5 top-1.5 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(event) => {
                  // The card behind this is itself a button — without stopping here, releasing a
                  // table would also open its order.
                  event.stopPropagation();
                  onRelease();
                }}
              >
                <X className="size-3.5" />
              </button>
            }
          />
          <TooltipContent>Release table</TooltipContent>
        </Tooltip>
      )}
      <button
        type="button"
        onClick={onSelect}
        disabled={isBusy}
        className={cn(
          'flex min-h-28 w-full flex-col justify-between rounded-lg border p-3 text-left transition-colors',
          'hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
          STATUS_STYLES[table.status],
        )}
      >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold">{table.name}</span>
        <span className={cn('flex items-center gap-1 text-[11px] text-muted-foreground', releasable && 'mr-6')}>
          <Users className="size-3" />
          {table.seats}
        </span>
      </div>
      <div className="space-y-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium">
          <span className={cn('size-1.5 rounded-full', STATUS_DOT[table.status])} />
          {restaurantApi.TABLE_STATUS_LABELS[table.status]}
        </span>
        {table.kitchen_state && (
          <span className="text-[11px] font-medium text-muted-foreground">
            {KITCHEN_STATE_LABELS[table.kitchen_state]}
          </span>
        )}
        {table.active_order_id && (
          <p className="text-[11px] text-muted-foreground">
            {table.active_order_number} · {table.active_order_item_count} item
            {table.active_order_item_count === 1 ? '' : 's'} · {(table.active_order_total ?? 0).toFixed(2)}
          </p>
        )}
      </div>
      </button>
    </div>
  );
}

export function TablesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingTableId, setPendingTableId] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<TableWithOrder | null>(null);
  // Releasing a table cancels an order, so it follows table management rather than being
  // available to anyone who can take an order.
  const canRelease = useFeatureFlag('table_management');

  const { data: layout, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['restaurant', 'layout'],
    queryFn: restaurantApi.getLayout,
  });

  const openOrder = useMutation({
    mutationFn: (table: TableWithOrder) =>
      restaurantApi.createOrder({ order_type: 'dine_in', table_id: table.id }),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['restaurant', 'layout'] });
      navigate(`/restaurant/orders/${order.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not open an order for this table'),
    onSettled: () => setPendingTableId(null),
  });

  /** Selecting an occupied table opens the order already on it; an available one starts a new
   * order. Two live orders on one table is the thing this must never do. */
  function handleSelect(table: TableWithOrder) {
    if (table.active_order_id) {
      navigate(`/restaurant/orders/${table.active_order_id}`);
      return;
    }
    setPendingTableId(table.id);
    openOrder.mutate(table);
  }

  const releaseTable = useMutation({
    mutationFn: ({ tableId, cancelOrder }: { tableId: string; cancelOrder: boolean }) =>
      restaurantApi.releaseTable(tableId, cancelOrder),
    onSuccess: (table) => {
      toast.success(`${tableLabel(table.name)} released`);
      setReleasing(null);
      queryClient.invalidateQueries({ queryKey: ['restaurant'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not release that table')),
  });

  const hasTables = (layout ?? []).some((group) => group.tables.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Tables</h1>
          <p className="text-sm text-muted-foreground">
            Select a free table to start an order, or an occupied one to open its running bill.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/restaurant/setup')}>
            Manage tables
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load the floor"
          description={apiErrorMessage(error, 'Something went wrong loading your tables.')}
        />
      ) : !hasTables ? (
        <EmptyState
          icon={LayoutGrid}
          title="No tables yet"
          description="Add your floors and tables to start taking dine-in orders."
          action={<Button onClick={() => navigate('/restaurant/setup')}>Manage tables</Button>}
        />
      ) : (
        <div className="space-y-5">
          {(layout ?? []).map((group) => (
            <Card key={group.floor?.id ?? 'unassigned'} className="p-4">
              <p className="mb-3 text-sm font-medium">
                {group.floor?.name ?? 'Unassigned'}
                <Badge variant="secondary" className="ml-2">{group.tables.length}</Badge>
              </p>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {group.tables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    isBusy={pendingTableId === table.id}
                    canRelease={canRelease}
                    onSelect={() => handleSelect(table)}
                    onRelease={() => setReleasing(table)}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {releasing && (
        <ReleaseTableDialog
          table={releasing}
          open
          onOpenChange={(next) => !next && setReleasing(null)}
          isPending={releaseTable.isPending}
          onConfirm={(cancelOrder) => releaseTable.mutate({ tableId: releasing.id, cancelOrder })}
        />
      )}
    </div>
  );
}
