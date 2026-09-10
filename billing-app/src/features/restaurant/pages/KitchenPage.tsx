import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ChefHat, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import * as restaurantApi from '@/features/restaurant/api';
import type { Kot, KotStatus } from '@/features/restaurant/api';
import { ApiError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/query-error';
import { cn } from '@/lib/utils';

/** The kitchen board only ever moves a ticket forward. Cancelling is deliberately not here — it
 * needs a reason, and that belongs with the order, not the pass. */
const NEXT_STATUS: Partial<Record<KotStatus, { next: KotStatus; label: string }>> = {
  pending: { next: 'preparing', label: 'Start preparing' },
  preparing: { next: 'ready', label: 'Mark ready' },
  ready: { next: 'served', label: 'Mark served' },
};

const COLUMNS: { status: KotStatus; label: string; accent: string }[] = [
  { status: 'pending', label: 'Pending', accent: 'border-t-amber-500' },
  { status: 'preparing', label: 'Preparing', accent: 'border-t-blue-500' },
  { status: 'ready', label: 'Ready', accent: 'border-t-emerald-500' },
];

function KotCard({ kot, onAdvance, isBusy }: { kot: Kot; onAdvance: () => void; isBusy: boolean }) {
  const action = NEXT_STATUS[kot.status];
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{kot.kot_number}</span>
        <span className="text-[11px] text-muted-foreground">
          {new Date(kot.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {kot.items.map((item) => (
          <li key={item.id} className="text-xs">
            <span className="font-semibold">{item.quantity} ×</span> {item.product_name}
            {item.notes && <span className="block pl-4 italic text-muted-foreground">{item.notes}</span>}
          </li>
        ))}
      </ul>
      {kot.notes && <p className="mt-1 text-[11px] italic text-muted-foreground">{kot.notes}</p>}
      {action && (
        <Button size="sm" className="mt-2 h-7 w-full text-xs" disabled={isBusy} onClick={onAdvance}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function KitchenPage() {
  const queryClient = useQueryClient();
  const { data: kots, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['restaurant', 'kots'],
    queryFn: () => restaurantApi.listKots(),
    // The pass needs this current without anyone clicking refresh.
    refetchInterval: 15_000,
  });

  const advance = useMutation({
    mutationFn: ({ kotId, status }: { kotId: string; status: KotStatus }) =>
      restaurantApi.setKotStatus(kotId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['restaurant', 'kots'] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update that ticket'),
  });

  const live = (kots ?? []).filter((k) => k.status !== 'cancelled' && k.status !== 'served');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Kitchen KOT</h1>
          <p className="text-sm text-muted-foreground">Tickets move forward only — Pending, Preparing, Ready.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load the kitchen"
          description={apiErrorMessage(error, 'Something went wrong loading kitchen tickets.')}
        />
      ) : live.length === 0 ? (
        <EmptyState icon={ChefHat} title="Nothing in the kitchen" description="New tickets appear here as they're sent." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {COLUMNS.map((column) => {
            const items = live.filter((k) => k.status === column.status);
            return (
              <Card key={column.status} className={cn('border-t-4 p-3', column.accent)}>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  {column.label}
                  <Badge variant="secondary">{items.length}</Badge>
                </p>
                <div className="space-y-2">
                  {items.map((kot) => (
                    <KotCard
                      key={kot.id}
                      kot={kot}
                      isBusy={advance.isPending}
                      onAdvance={() => {
                        const next = NEXT_STATUS[kot.status];
                        if (next) advance.mutate({ kotId: kot.id, status: next.next });
                      }}
                    />
                  ))}
                  {items.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">Empty</p>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
