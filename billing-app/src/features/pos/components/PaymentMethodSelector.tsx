import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NumericInput } from '@/components/ui/numeric-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PaymentMethod, PaymentType } from '@/features/pos/api';

interface PaymentMethodSelectorProps {
  method: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  paymentType: PaymentType;
  onPaymentTypeChange: (type: PaymentType) => void;
  amountTendered: number | null;
  onAmountTenderedChange: (value: number | null) => void;
  paidNow: number | null;
  onPaidNowChange: (value: number | null) => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  total: number;
  /** Hides the Paid in Full / Partially Paid / Pay Later tabs — used when the tenant's
   * Outstanding module is disabled, so every sale is always paid in full immediately. */
  showPaymentType?: boolean;
}

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  paid: 'Paid in Full',
  partial: 'Partially Paid',
  credit: 'Credit (Pay Later)',
};

export function PaymentMethodSelector({
  method,
  onMethodChange,
  paymentType,
  onPaymentTypeChange,
  amountTendered,
  onAmountTenderedChange,
  paidNow,
  onPaidNowChange,
  dueDate,
  onDueDateChange,
  total,
  showPaymentType = true,
}: PaymentMethodSelectorProps) {
  const change = paymentType === 'paid' && method === 'cash' && amountTendered !== null ? amountTendered - total : null;
  const outstanding = paymentType === 'credit' ? total : Math.max(0, total - (paidNow ?? 0));

  return (
    <div className="space-y-1.5">
      {showPaymentType && (
        <Tabs value={paymentType} onValueChange={(value) => onPaymentTypeChange(value as PaymentType)}>
          <TabsList className="h-9 grid w-full grid-cols-3">
            {(Object.keys(PAYMENT_TYPE_LABELS) as PaymentType[]).map((type) => (
              <TabsTrigger key={type} value={type}>
                {PAYMENT_TYPE_LABELS[type]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <Tabs value={method} onValueChange={(value) => onMethodChange(value as PaymentMethod)}>
        <TabsList className="h-9 grid w-full grid-cols-3">
          <TabsTrigger value="cash">Cash</TabsTrigger>
          <TabsTrigger value="card">Card</TabsTrigger>
          <TabsTrigger value="upi">UPI</TabsTrigger>
        </TabsList>
      </Tabs>

      {paymentType === 'paid' && method === 'cash' && (
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="amount-tendered" className="text-xs text-muted-foreground">
              Amount tendered
            </Label>
            <NumericInput
              id="amount-tendered"
              min={0}
              required={false}
              value={amountTendered}
              onChange={onAmountTenderedChange}
            />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Change due</p>
            <p className={`text-lg font-semibold ${change !== null && change < 0 ? 'text-destructive' : ''}`}>
              {change !== null ? change.toFixed(2) : '—'}
            </p>
          </div>
        </div>
      )}

      {(paymentType === 'partial' || paymentType === 'credit') && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2">
          {paymentType === 'partial' && (
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="paid-now" className="text-xs text-muted-foreground">
                  Paid today
                </Label>
                <NumericInput id="paid-now" min={0} max={total} required={false} value={paidNow} onChange={onPaidNowChange} />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-lg font-semibold">{outstanding.toFixed(2)}</p>
              </div>
            </div>
          )}
          {paymentType === 'credit' && (
            <p className="text-sm text-muted-foreground">
              Full amount of <span className="font-medium text-foreground">{total.toFixed(2)}</span> will be recorded as outstanding.
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="due-date" className="text-xs text-muted-foreground">
              Due date
            </Label>
            <Input id="due-date" type="date" value={dueDate} onChange={(e) => onDueDateChange(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}
