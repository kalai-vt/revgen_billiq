import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { TableWithOrder } from '@/features/restaurant/api';
import { tableLabel } from '@/features/restaurant/lib/tableLabel';

interface ReleaseTableDialogProps {
  table: TableWithOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (cancelOrder: boolean) => void;
  isPending: boolean;
}

/** Frees a table that was taken by mistake, or whose guests left without ordering.
 *
 * The wording changes with what is actually at stake, because "Release table" means something
 * very different when there is ₹630 of food on it. A tab with items is never discarded on a
 * single click, and one whose tickets are still with the kitchen is refused by the server
 * outright — that food is being cooked, so it has to go through KOT cancellation where a reason
 * is recorded. Tickets already served do not block: the food has gone out and the kitchen board
 * no longer shows them.
 */
export function ReleaseTableDialog({ table, open, onOpenChange, onConfirm, isPending }: ReleaseTableDialogProps) {
  const itemCount = table.active_order_item_count ?? 0;
  const total = table.active_order_total ?? 0;
  const hasOrder = itemCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release {tableLabel(table.name)}?</DialogTitle>
        </DialogHeader>

        {hasOrder ? (
          <div className="space-y-2 py-1 text-sm">
            <p>
              {tableLabel(table.name)} has an active order with{' '}
              <span className="font-medium">
                {itemCount} item{itemCount === 1 ? '' : 's'}
              </span>{' '}
              worth <span className="font-medium">{total.toFixed(2)}</span>.
            </p>
            <p className="text-muted-foreground">
              Releasing the table will cancel that order. This can&apos;t be undone.
            </p>
          </div>
        ) : (
          <p className="py-1 text-sm text-muted-foreground">
            This table has no items on it. Releasing it just makes it available again — the table itself is not
            deleted.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {hasOrder ? 'Keep order' : 'Cancel'}
          </Button>
          <Button variant={hasOrder ? 'destructive' : 'default'} disabled={isPending} onClick={() => onConfirm(hasOrder)}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {hasOrder ? 'Release & cancel order' : 'Release table'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
