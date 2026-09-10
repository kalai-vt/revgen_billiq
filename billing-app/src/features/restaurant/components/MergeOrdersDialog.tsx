import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import * as restaurantApi from '@/features/restaurant/api';
import type { RestaurantOrder } from '@/features/restaurant/api';

interface MergeOrdersDialogProps {
  order: RestaurantOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (sourceOrderIds: string[]) => void;
  isPending: boolean;
}

/** Pulls other open orders into this one — the "they moved to join their friends' table" case.
 *
 * The direction is fixed: everything merges *into* the order you already have open, and the
 * orders you pick are closed and their tables released. Letting the target be chosen here too
 * would make it far too easy to close the wrong table's bill.
 */
export function MergeOrdersDialog({ order, open, onOpenChange, onConfirm, isPending }: MergeOrdersDialogProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const { data: openOrders, isLoading } = useQuery({
    queryKey: ['restaurant', 'orders', 'open'],
    queryFn: () => restaurantApi.listOrders({ status: 'open' }),
    enabled: open,
  });

  const candidates = (openOrders ?? []).filter((o) => o.id !== order.id);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge other orders into {order.order_number}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading open orders…</p>
        ) : candidates.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            There is no other open order to merge — this is the only one running.
          </p>
        ) : (
          <div className="space-y-2">
            <Label>Orders to merge in</Label>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {candidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={selected.includes(candidate.id)}
                    onChange={() => toggle(candidate.id)}
                  />
                  <span className="font-medium">
                    {candidate.table_name ? `Table ${candidate.table_name}` : 'Takeaway'}
                  </span>
                  <span className="text-muted-foreground">{candidate.order_number}</span>
                  <span className="ml-auto text-muted-foreground">
                    {candidate.totals?.item_count ?? 0} item{(candidate.totals?.item_count ?? 0) === 1 ? '' : 's'} ·{' '}
                    {(candidate.totals?.total ?? 0).toFixed(2)}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Items and kitchen tickets move onto {order.order_number}. The orders you pick are closed and their
              tables freed — this cannot be undone.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button disabled={selected.length === 0 || isPending} onClick={() => onConfirm(selected)}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Merge {selected.length > 0 ? `${selected.length} order${selected.length === 1 ? '' : 's'}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
