import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ChefHat, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import * as restaurantApi from '@/features/restaurant/api';
import type { Kot, KotStatus } from '@/features/restaurant/api';
import { ApiError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/query-error';
import { cn } from '@/lib/utils';

/** The kitchen board moves a ticket forward, or pulls it.
 *
 * Cancelling used to live only on the order screen, on the theory that a reason belongs with the
 * order rather than the pass. In practice that left the kitchen with no way to pull a ticket at
 * all, and made "cancel those first, then release the table" an instruction with nowhere to carry
 * it out. The reason is still required here — it is the trail for why food was pulled. */
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

function KotCard({
  kot,
  onAdvance,
  onCancel,
  isBusy,
  isCancelling,
}: {
  kot: Kot;
  onAdvance: () => void;
  onCancel: (reason: string) => void;
  isBusy: boolean;
  isCancelling: boolean;
}) {
  const action = NEXT_STATUS[kot.status];
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');

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
      {asking ? (
        <div className="mt-2 space-y-1.5">
          {/* A reason is required: cancelling means food may already be on the pass, so the trail
              for why it was pulled matters. Same rule as the order screen. */}
          <Input
            placeholder="Reason for cancelling…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-xs"
              disabled={isCancelling}
              onClick={() => {
                setAsking(false);
                setReason('');
              }}
            >
              Keep
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 flex-1 text-xs"
              disabled={!reason.trim() || isCancelling}
              onClick={() => onCancel(reason.trim())}
            >
              Confirm
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-1.5">
          {action && (
            <Button size="sm" className="h-7 flex-1 text-xs" disabled={isBusy} onClick={onAdvance}>
              {action.label}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className={cn('h-7 text-xs text-destructive hover:text-destructive', action ? 'px-2' : 'flex-1')}
            disabled={isBusy}
            onClick={() => setAsking(true)}
          >
            Cancel
          </Button>
        </div>
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

  const cancelKot = useMutation({
    mutationFn: ({ kotId, reason }: { kotId: string; reason: string }) => restaurantApi.cancelKot(kotId, reason),
    onSuccess: (kot) => {
      // The order's line quantities go back to "not yet sent" when a ticket is pulled, so the
      // table board and any open order screen are refreshed too, not just this list.
      queryClient.invalidateQueries({ queryKey: ['restaurant'] });
      toast.success(`${kot.kot_number} cancelled`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not cancel that ticket'),
  });

  const live = (kots ?? []).filter((k) => k.status !== 'cancelled' && k.status !== 'served');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Kitchen KOT</h1>
          <p className="text-sm text-muted-foreground">Tickets move forward — Pending, Preparing, Ready. Cancel one to pull it from the kitchen.</p>
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
                      isBusy={advance.isPending || cancelKot.isPending}
                      isCancelling={cancelKot.isPending}
                      onAdvance={() => {
                        const next = NEXT_STATUS[kot.status];
                        if (next) advance.mutate({ kotId: kot.id, status: next.next });
                      }}
                      onCancel={(reason) => cancelKot.mutate({ kotId: kot.id, reason })}
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
