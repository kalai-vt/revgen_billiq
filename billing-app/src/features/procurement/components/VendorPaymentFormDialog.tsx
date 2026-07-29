import { useEffect, useState, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VendorPicker } from '@/features/procurement/components/VendorPicker';
import * as procurementApi from '@/features/procurement/api';
import type { VendorPaymentMethod } from '@/features/procurement/api';
import { ApiError } from '@/lib/api-client';

const PAYMENT_METHOD_LABELS: Record<VendorPaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
};

interface VendorPaymentFormDialogProps {
  vendorId?: string;
  trigger: ReactElement;
}

export function VendorPaymentFormDialog({ vendorId: initialVendorId, trigger }: VendorPaymentFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(initialVendorId ?? null);
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<VendorPaymentMethod>('bank_transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setVendorId(initialVendorId ?? null);
      setAmount(0);
      setPaymentMethod('bank_transfer');
      setReferenceNumber('');
      setNotes('');
      setError(null);
    }
  }, [open, initialVendorId]);

  const { data: outstandingPurchases } = useQuery({
    queryKey: ['procurement-vendor-outstanding-purchases', vendorId],
    queryFn: () => procurementApi.listOutstandingPurchases(vendorId!),
    enabled: !!vendorId,
  });
  const totalOutstanding = outstandingPurchases?.reduce((sum, p) => sum + p.outstanding_amount, 0) ?? 0;

  const mutation = useMutation({
    mutationFn: () => {
      if (!vendorId) throw new ApiError(400, 'Select a vendor first');
      if (amount <= 0) throw new ApiError(400, 'Enter a payment amount');
      return procurementApi.createVendorPayment({
        vendor_id: vendorId,
        amount,
        payment_method: paymentMethod,
        reference_number: referenceNumber || null,
        notes: notes || null,
      });
    },
    onSuccess: () => {
      toast.success('Payment recorded');
      queryClient.invalidateQueries({ queryKey: ['procurement-vendor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-vendors'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-vendor-ledger'] });
      setOpen(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record vendor payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <VendorPicker vendorId={vendorId} onSelect={setVendorId} />
          {vendorId && (
            <p className="text-xs text-muted-foreground">
              Outstanding: <span className="font-medium text-foreground">{totalOutstanding.toFixed(2)}</span> across{' '}
              {outstandingPurchases?.length ?? 0} purchase(s). Payment auto-applies oldest-due-first.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vp-amount">Amount</Label>
              <Input id="vp-amount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod((v as VendorPaymentMethod) ?? 'bank_transfer')}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => PAYMENT_METHOD_LABELS[paymentMethod]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYMENT_METHOD_LABELS) as VendorPaymentMethod[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {PAYMENT_METHOD_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vp-reference">Reference number</Label>
              <Input id="vp-reference" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vp-notes">Notes</Label>
              <Input id="vp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving…' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
