import { useEffect, useState, type ReactElement } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as procurementApi from '@/features/procurement/api';
import type { PurchaseEntry, ReturnReason } from '@/features/procurement/api';
import { RETURN_REASON_LABELS } from '@/features/procurement/api';
import { ApiError } from '@/lib/api-client';

interface LineState {
  itemId: string;
  productName: string;
  remaining: number;
  quantity: number;
  reason: ReturnReason;
}

interface PurchaseReturnFormDialogProps {
  purchase: PurchaseEntry;
  trigger: ReactElement;
}

export function PurchaseReturnFormDialog({ purchase, trigger }: PurchaseReturnFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'credit_note' | 'cash' | 'bank_transfer'>('credit_note');
  const [lines, setLines] = useState<LineState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setReason('');
      setRefundMethod('credit_note');
      setLines(
        purchase.items
          .map((item) => ({
            itemId: item.id,
            productName: item.product_name,
            remaining: item.quantity - item.returned_quantity,
            quantity: 0,
            reason: 'other' as ReturnReason,
          }))
          .filter((l) => l.remaining > 0),
      );
      setError(null);
    }
  }, [open, purchase]);

  function updateLine(itemId: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)));
  }

  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

  const mutation = useMutation({
    mutationFn: () => {
      const selected = lines.filter((l) => l.quantity > 0);
      if (selected.length === 0) throw new ApiError(400, 'Enter a quantity to return for at least one item');
      return procurementApi.createReturn({
        purchase_entry_id: purchase.id,
        reason: reason || null,
        refund_method: refundMethod,
        lines: selected.map((l) => ({ purchase_entry_item_id: l.itemId, quantity: l.quantity, reason: l.reason })),
      });
    },
    onSuccess: () => {
      toast.success('Return recorded');
      queryClient.invalidateQueries({ queryKey: ['procurement-returns'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase', purchase.id] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-vendors'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setOpen(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Return items from {purchase.purchase_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every item on this purchase has already been fully returned.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-24">Remaining</TableHead>
                  <TableHead className="w-24">Return qty</TableHead>
                  <TableHead className="w-40">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.itemId}>
                    <TableCell className="max-w-[140px] truncate">{line.productName}</TableCell>
                    <TableCell>{line.remaining}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={line.remaining}
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.itemId, { quantity: Math.min(Number(e.target.value), line.remaining) })}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={line.reason} onValueChange={(v) => updateLine(line.itemId, { reason: (v as ReturnReason) ?? 'other' })}>
                        <SelectTrigger className="h-8 w-full">
                          <SelectValue>{() => RETURN_REASON_LABELS[line.reason]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(RETURN_REASON_LABELS) as ReturnReason[]).map((key) => (
                            <SelectItem key={key} value={key}>
                              {RETURN_REASON_LABELS[key]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Refund method</Label>
              <Select value={refundMethod} onValueChange={(v) => setRefundMethod((v as typeof refundMethod) ?? 'credit_note')}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {() => ({ credit_note: 'Vendor credit note', cash: 'Cash', bank_transfer: 'Bank transfer' })[refundMethod]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_note">Vendor credit note</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="return-reason">Notes</Label>
              <Input id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" disabled={mutation.isPending || totalUnits === 0} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving…' : 'Record return'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
