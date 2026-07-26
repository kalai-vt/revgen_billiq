import { useState, type FormEvent, type ReactElement } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import * as inventoryApi from '@/features/inventory/api';
import { STOCK_REASONS, STOCK_REASON_LABELS } from '@/features/inventory/api';
import type { InventoryItem, MovementType, StockReason } from '@/features/inventory/api';
import { ApiError } from '@/lib/api-client';

const MOVEMENT_LABELS: Record<MovementType, string> = { add: 'Add Stock', reduce: 'Reduce Stock', adjust: 'Adjust Stock' };

interface StockAdjustDialogProps {
  item: InventoryItem;
  trigger: ReactElement;
}

export function StockAdjustDialog({ item, trigger }: StockAdjustDialogProps) {
  const [open, setOpen] = useState(false);
  const [movementType, setMovementType] = useState<MovementType>('add');
  const [quantity, setQuantity] = useState<number | null>(null);
  const [reason, setReason] = useState<StockReason>('purchase');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  function resetForm() {
    setMovementType('add');
    setQuantity(null);
    setReason('purchase');
    setNotes('');
    setError(null);
  }

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.adjustStock(item.product_id, {
        movement_type: movementType,
        quantity: quantity ?? 0,
        reason,
        notes: notes || null,
      }),
    onSuccess: () => {
      toast.success('Stock updated');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['stock-history'] });
      setOpen(false);
      resetForm();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Stock — {item.product_name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current stock: <span className="font-medium text-foreground">{item.quantity}</span>
          </p>

          <Tabs value={movementType} onValueChange={(value) => setMovementType(value as MovementType)}>
            <TabsList className="grid w-full grid-cols-3">
              {(Object.keys(MOVEMENT_LABELS) as MovementType[]).map((type) => (
                <TabsTrigger key={type} value={type}>
                  {MOVEMENT_LABELS[type]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stock-quantity">{movementType === 'adjust' ? 'New quantity' : 'Quantity'}</Label>
              <NumericInput id="stock-quantity" min={0} required={false} value={quantity} onChange={setQuantity} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stock-reason">Reason</Label>
              <Select value={reason} onValueChange={(value) => setReason(value as StockReason)}>
                <SelectTrigger id="stock-reason" className="w-full">
                  <SelectValue>{(value: string | null) => STOCK_REASON_LABELS[(value as StockReason) ?? 'purchase']}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STOCK_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {STOCK_REASON_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stock-notes">Notes (optional)</Label>
            <Input id="stock-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending || quantity === null}>
              {mutation.isPending ? 'Saving…' : 'Update Inventory'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
