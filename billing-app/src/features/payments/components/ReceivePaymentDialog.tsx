import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as customersApi from '@/features/customers/api';
import * as paymentsApi from '@/features/payments/api';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '@/features/payments/api';
import type { PaymentMethod } from '@/features/payments/api';
import { ApiError } from '@/lib/api-client';

interface ReceivePaymentDialogProps {
  open: boolean;
  onClose: () => void;
  /** When set, the customer is fixed (opened from a customer/invoice context) and the picker is hidden. */
  customerId?: string | null;
  onSuccess?: () => void;
}

export function ReceivePaymentDialog({ open, onClose, customerId: fixedCustomerId, onSuccess }: ReceivePaymentDialogProps) {
  const [customerId, setCustomerId] = useState<string | null>(fixedCustomerId ?? null);
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [manualAllocations, setManualAllocations] = useState<Record<string, number>>({});
  const [manualMode, setManualMode] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setCustomerId(fixedCustomerId ?? null);
      setAmount(null);
      setMethod('cash');
      setReference('');
      setNotes('');
      setManualAllocations({});
      setManualMode(false);
    }
  }, [open, fixedCustomerId]);

  const { data: customers } = useQuery({
    queryKey: ['customers-picker-credit'],
    queryFn: () => customersApi.listCustomers({ page: 1, page_size: 100, is_active: true, has_outstanding: true }),
    enabled: open && !fixedCustomerId,
  });

  const { data: outstandingInvoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['outstanding-invoices', customerId],
    queryFn: () => paymentsApi.getOutstandingInvoices(customerId!),
    enabled: open && !!customerId,
  });

  const totalManualAllocated = Object.values(manualAllocations).reduce((sum, v) => sum + (v || 0), 0);

  const mutation = useMutation({
    mutationFn: () =>
      paymentsApi.createPayment({
        customer_id: customerId!,
        amount: amount ?? 0,
        payment_method: method,
        reference_number: reference || null,
        notes: notes || null,
        allocations: manualMode
          ? Object.entries(manualAllocations)
              .filter(([, amt]) => amt > 0)
              .map(([invoice_id, amt]) => ({ invoice_id, amount: amt }))
          : null,
      }),
    onSuccess: (payment) => {
      toast.success(`Payment ${payment.payment_number} recorded successfully.`);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
      queryClient.invalidateQueries({ queryKey: ['customer-ledger', customerId] });
      queryClient.invalidateQueries({ queryKey: ['credit-summary', customerId] });
      queryClient.invalidateQueries({ queryKey: ['outstanding-dashboard'] });
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function autoAllocate() {
    if (!outstandingInvoices || amount === null) return;
    let remaining = amount;
    const next: Record<string, number> = {};
    for (const inv of outstandingInvoices.items) {
      if (remaining <= 0) break;
      const apply = Math.min(remaining, inv.outstanding_amount);
      if (apply > 0) {
        next[inv.id] = Math.round(apply * 100) / 100;
        remaining -= apply;
      }
    }
    setManualAllocations(next);
  }

  const canSubmit =
    !!customerId &&
    amount !== null &&
    amount > 0 &&
    (!manualMode || Math.abs(totalManualAllocated - amount) < 0.01);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {!fixedCustomerId && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Customer</Label>
              <Select value={customerId ?? ''} onValueChange={(value) => setCustomerId(value || null)}>
                <SelectTrigger>
                  <SelectValue>
                    {() => customers?.items.find((c) => c.id === customerId)?.name ?? 'Select a customer with outstanding balance'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {customers?.items.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — outstanding {c.outstanding_amount.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {customerId && (
            <div className="rounded-md border">
              {invoicesLoading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead className="hidden sm:table-cell">Due Date</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      {manualMode && <TableHead className="w-28 text-right">Allocate</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outstandingInvoices?.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-4 text-center text-sm text-muted-foreground">
                          No outstanding invoices for this customer.
                        </TableCell>
                      </TableRow>
                    )}
                    {outstandingInvoices?.items.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {inv.due_date ?? '—'} {inv.is_overdue && <span className="text-destructive">(overdue)</span>}
                        </TableCell>
                        <TableCell className="text-right">{inv.outstanding_amount.toFixed(2)}</TableCell>
                        {manualMode && (
                          <TableCell className="text-right">
                            <NumericInput
                              value={manualAllocations[inv.id] ?? 0}
                              onChange={(v) => setManualAllocations((prev) => ({ ...prev, [inv.id]: v ?? 0 }))}
                              min={0}
                              max={inv.outstanding_amount}
                              className="text-right"
                              aria-label={`Allocate to ${inv.invoice_number}`}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="payment-amount" className="text-xs text-muted-foreground">
                Amount received
              </Label>
              <NumericInput id="payment-amount" value={amount} onChange={setAmount} min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Payment Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue>{(v: string | null) => PAYMENT_METHOD_LABELS[(v as PaymentMethod) ?? 'cash']}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="payment-reference" className="text-xs text-muted-foreground">
                Reference Number (optional)
              </Label>
              <Input id="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-notes" className="text-xs text-muted-foreground">
                Notes (optional)
              </Label>
              <Input id="payment-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/30 p-2">
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant={manualMode ? 'outline' : 'default'} onClick={() => setManualMode(false)}>
                Auto Allocate
              </Button>
              <Button type="button" size="sm" variant={manualMode ? 'default' : 'outline'} onClick={() => setManualMode(true)}>
                Allocate Manually
              </Button>
            </div>
            {manualMode && (
              <Button type="button" size="sm" variant="ghost" onClick={autoAllocate} disabled={amount === null}>
                Fill automatically
              </Button>
            )}
          </div>
          {manualMode && amount !== null && (
            <p className={`text-xs ${Math.abs(totalManualAllocated - amount) < 0.01 ? 'text-muted-foreground' : 'text-destructive'}`}>
              Allocated {totalManualAllocated.toFixed(2)} of {amount.toFixed(2)}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Recording…' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
