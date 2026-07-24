import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as posApi from '@/features/pos/api';
import { ApiError } from '@/lib/api-client';

interface ReturnDialogProps {
  invoiceId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReturnDialog({ invoiceId, onClose, onSuccess }: ReturnDialogProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => posApi.getInvoice(invoiceId!),
    enabled: !!invoiceId,
  });

  useEffect(() => {
    // Keyed on invoiceId (not the query's `invoice` data object) — a background refetch of
    // the same invoice must not wipe the quantities the user is already entering.
    setQuantities({});
    setReason('');
  }, [invoiceId]);

  const returnMutation = useMutation({
    mutationFn: () => {
      const lines = Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([invoice_item_id, quantity]) => ({ invoice_item_id, quantity }));
      return posApi.createReturn(invoiceId!, lines, reason || undefined);
    },
    onSuccess: (result) => {
      toast.success(`Return ${result.return_number} processed — refund of ${result.refund_amount.toFixed(2)}`);
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function remaining(item: { quantity: number; returned_quantity: number }) {
    return Math.max(0, item.quantity - item.returned_quantity);
  }

  function returnEntireInvoice() {
    if (!invoice) return;
    const next: Record<string, number> = {};
    for (const item of invoice.items) {
      const max = remaining(item);
      if (max > 0) next[item.id] = max;
    }
    setQuantities(next);
  }

  const hasAnyQuantity = Object.values(quantities).some((qty) => qty > 0);

  return (
    <Dialog open={!!invoiceId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {isLoading || !invoice ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Return items — {invoice.invoice_number}</DialogTitle>
            </DialogHeader>

            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={returnEntireInvoice}>
                Return entire invoice
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Already returned</TableHead>
                    <TableHead className="text-right w-28">Return qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map((item) => {
                    const max = remaining(item);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.product_name}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{item.returned_quantity}</TableCell>
                        <TableCell className="text-right">
                          <NumericInput
                            value={quantities[item.id] ?? 0}
                            onChange={(value) =>
                              setQuantities((prev) => ({ ...prev, [item.id]: value ?? 0 }))
                            }
                            min={0}
                            max={max}
                            allowDecimal
                            disabled={max <= 0}
                            className="text-right"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="return-reason">Reason (optional)</Label>
              <Input id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!hasAnyQuantity || returnMutation.isPending}
                onClick={() => returnMutation.mutate()}
              >
                {returnMutation.isPending ? 'Processing…' : 'Process return'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
