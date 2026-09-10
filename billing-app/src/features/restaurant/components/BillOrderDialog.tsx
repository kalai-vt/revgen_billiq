import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { BillOrderPayload, RestaurantOrder } from '@/features/restaurant/api';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
] as const;

type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value'];
type DiscountType = 'none' | 'flat' | 'percent';

const DISCOUNT_LABELS: Record<DiscountType, string> = {
  none: 'No discount',
  flat: 'Flat amount',
  percent: 'Percent',
};

interface BillOrderDialogProps {
  order: RestaurantOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: BillOrderPayload) => void;
  isPending: boolean;
}

export function BillOrderDialog({ order, open, onOpenChange, onConfirm, isPending }: BillOrderDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [discountValue, setDiscountValue] = useState('0');
  const [markPaid, setMarkPaid] = useState(true);
  const [paymentReference, setPaymentReference] = useState('');

  const subtotal = order.totals?.total ?? 0;
  const discount =
    discountType === 'none'
      ? 0
      : discountType === 'percent'
        ? (subtotal * (Number(discountValue) || 0)) / 100
        : Number(discountValue) || 0;
  // Never show a negative payable — a discount larger than the bill is a data-entry slip, not a
  // refund, and the server clamps it the same way.
  const payable = Math.max(0, subtotal - discount);

  function handleConfirm() {
    onConfirm({
      payment_method: paymentMethod,
      // Cash has no reference, so don't carry one over if the cashier switched methods.
      payment_reference: paymentMethod === 'cash' ? null : paymentReference.trim() || null,
      discount_type: discountType === 'none' ? null : discountType,
      discount_value: discountType === 'none' ? 0 : Number(discountValue) || 0,
      mark_paid: markPaid,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Bill {order.table_name ? `Table ${order.table_name}` : 'takeaway order'} — {order.order_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod((v as PaymentMethod) ?? 'cash')}>
              <SelectTrigger className="w-full">
                {/* Without a mapper base-ui shows the raw value — "upi" rather than "UPI". */}
                <SelectValue>
                  {(value: string | null) =>
                    PAYMENT_METHODS.find((m) => m.value === value)?.label ?? 'Cash'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {paymentMethod === 'upi' && (
              <p className="text-[11px] text-muted-foreground">
                The invoice carries a UPI QR when one is configured. Scanning it is not proof of payment — only
                mark this paid once the money has actually arrived.
              </p>
            )}
          </div>

          {paymentMethod !== 'cash' && (
            <div className="space-y-1.5">
              <Label htmlFor="bill-payment-reference">
                {paymentMethod === 'upi' ? 'UPI transaction ID' : 'Card approval code'} (optional)
              </Label>
              <Input
                id="bill-payment-reference"
                value={paymentReference}
                maxLength={80}
                placeholder={paymentMethod === 'upi' ? 'e.g. 447190223344' : 'e.g. 004512'}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Recorded on the invoice so this bill can be matched to the bank statement later.
              </p>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Discount</Label>
              <Select value={discountType} onValueChange={(v) => setDiscountType((v as DiscountType) ?? 'none')}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) => DISCOUNT_LABELS[(value as DiscountType) ?? 'none']}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No discount</SelectItem>
                  <SelectItem value="flat">Flat amount</SelectItem>
                  <SelectItem value="percent">Percent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {discountType !== 'none' && (
              <div className="space-y-1.5">
                <Label htmlFor="bill-discount-value">{discountType === 'percent' ? 'Percent' : 'Amount'}</Label>
                <Input
                  id="bill-discount-value"
                  type="number"
                  min={0}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              id="bill-mark-paid"
              type="checkbox"
              className="size-4 rounded border-input"
              checked={markPaid}
              onChange={(e) => setMarkPaid(e.target.checked)}
            />
            <Label htmlFor="bill-mark-paid" className="text-sm font-normal">
              Payment received
            </Label>
          </div>
          {!markPaid && (
            <p className="text-[11px] text-muted-foreground">
              The invoice is left unpaid and shows up under Outstanding for collection later — the usual running-tab
              case.
            </p>
          )}

          <div className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Order total</span>
              <span>{subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span>-{discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 text-base font-semibold">
              <span>Payable</span>
              <span>{payable.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Bill & close table
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
