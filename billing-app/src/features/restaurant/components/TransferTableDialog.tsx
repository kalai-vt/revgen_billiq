import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as restaurantApi from '@/features/restaurant/api';

interface TransferTableDialogProps {
  currentTableId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (tableId: string) => void;
  isPending: boolean;
}

export function TransferTableDialog({
  currentTableId,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: TransferTableDialogProps) {
  const [tableId, setTableId] = useState<string>('');
  const { data: layout } = useQuery({
    queryKey: ['restaurant', 'layout'],
    queryFn: restaurantApi.getLayout,
    enabled: open,
  });

  // Only tables that can actually take the order: not this one, and not one already running an
  // order of its own — moving onto an occupied table would be rejected by the server anyway.
  const available = (layout ?? [])
    .flatMap((group) => group.tables.map((table) => ({ table, floor: group.floor?.name })))
    .filter(({ table }) => table.id !== currentTableId && !table.active_order_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move this order to another table</DialogTitle>
        </DialogHeader>

        {available.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No free table to move to — every other table already has an order on it.
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label>Destination table</Label>
            <Select value={tableId} onValueChange={(value) => setTableId(value ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => (tableId ? available.find((a) => a.table.id === tableId)?.table.name : 'Select a table')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {available.map(({ table, floor }) => (
                  <SelectItem key={table.id} value={table.id}>
                    {table.name}
                    {floor ? ` · ${floor}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Items and kitchen tickets move with the order, and the old table is released.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button disabled={!tableId || isPending} onClick={() => onConfirm(tableId)}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Move order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
