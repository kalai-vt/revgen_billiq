import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as restaurantApi from '@/features/restaurant/api';
import type { RestaurantOrder } from '@/features/restaurant/api';

/** The Select needs a real string for "no table" — an empty value would clear the selection. */
const TAKEAWAY = '__takeaway__';

export interface SplitSelection {
  items: { order_item_id: string; quantity: number }[];
  toTableId: string | null;
}

interface SplitOrderDialogProps {
  order: RestaurantOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selection: SplitSelection) => void;
  isPending: boolean;
}

/** Moves part of an order onto a new one — separate bills for one table.
 *
 * Quantities are picked per item rather than "split evenly N ways" because that is what actually
 * happens at a table: one guest leaves early and pays for their two dishes, and an even split
 * would put a share of everyone else's food on their bill.
 */
export function SplitOrderDialog({ order, open, onOpenChange, onConfirm, isPending }: SplitOrderDialogProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [destination, setDestination] = useState<string>(TAKEAWAY);

  const { data: layout } = useQuery({
    queryKey: ['restaurant', 'layout'],
    queryFn: restaurantApi.getLayout,
    enabled: open,
  });

  const items = order.items.filter((item) => !item.is_cancelled);

  const freeTables = (layout ?? [])
    .flatMap((group) => group.tables.map((table) => ({ table, floor: group.floor?.name })))
    .filter(({ table }) => table.id !== order.table_id && !table.active_order_id);

  function destinationLabel(value: string | null): string {
    if (!value || value === TAKEAWAY) return 'No table (takeaway)';
    const match = freeTables.find(({ table }) => table.id === value);
    return match ? `${match.table.name}${match.floor ? ` · ${match.floor}` : ''}` : 'No table (takeaway)';
  }

  const selections = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([order_item_id, quantity]) => ({ order_item_id, quantity })),
    [quantities],
  );

  const movedTotal = selections.reduce((sum, selection) => {
    const item = items.find((i) => i.id === selection.order_item_id);
    return sum + (item ? item.unit_price * selection.quantity : 0);
  }, 0);

  // Splitting off everything would leave an empty order behind rather than "splitting" anything —
  // that is a table transfer, which has its own button.
  const movingEverything =
    selections.length > 0 && items.every((item) => (quantities[item.id] ?? 0) >= item.quantity);

  function adjust(itemId: string, max: number, delta: number) {
    setQuantities((current) => {
      const next = Math.min(max, Math.max(0, (current[itemId] ?? 0) + delta));
      return { ...current, [itemId]: next };
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Split {order.order_number} into a separate bill</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>What moves to the new bill</Label>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {items.map((item) => {
                const picked = quantities[item.id] ?? 0;
                return (
                  <div key={item.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{item.product_name}</span>
                    <span className="text-xs text-muted-foreground">of {item.quantity}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="size-7"
                      aria-label={`Move one less ${item.product_name}`}
                      disabled={picked === 0}
                      onClick={() => adjust(item.id, item.quantity, -1)}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-6 text-center font-medium tabular-nums">{picked}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="size-7"
                      aria-label={`Move one more ${item.product_name}`}
                      disabled={picked >= item.quantity}
                      onClick={() => adjust(item.id, item.quantity, 1)}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>New bill sits on</Label>
            <Select value={destination} onValueChange={(value) => setDestination(value ?? TAKEAWAY)}>
              <SelectTrigger className="w-full">
                {/* base-ui renders the raw value unless given a mapper, which would show the
                    TAKEAWAY sentinel to the user verbatim. */}
                <SelectValue>{(value: string | null) => destinationLabel(value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TAKEAWAY}>No table (takeaway)</SelectItem>
                {freeTables.map(({ table, floor }) => (
                  <SelectItem key={table.id} value={table.id}>
                    {table.name}
                    {floor ? ` · ${floor}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {movingEverything && (
            <p className="text-[11px] text-destructive">
              That moves the whole order — use Move table instead, so this table isn't left with an empty bill.
            </p>
          )}

          <div className="flex justify-between rounded-md bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Moving to the new bill</span>
            <span className="font-semibold">{movedTotal.toFixed(2)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Anything the kitchen already made moves with it, so neither bill re-sends it.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            disabled={selections.length === 0 || movingEverything || isPending}
            onClick={() => onConfirm({ items: selections, toTableId: destination === TAKEAWAY ? null : destination })}
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Split off {selections.length > 0 ? `${selections.length} item${selections.length === 1 ? '' : 's'}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
