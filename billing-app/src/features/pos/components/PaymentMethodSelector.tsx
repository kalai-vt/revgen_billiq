import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NumericInput } from '@/components/ui/numeric-input';
import { Input } from '@/components/ui/input';
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
    <div className="space-y-1">
      {showPaymentType && (
        <Tabs value={paymentType} onValueChange={(value) => onPaymentTypeChange(value as PaymentType)}>
          <TabsList className="h-8 grid w-full grid-cols-3">
            {(Object.keys(PAYMENT_TYPE_LABELS) as PaymentType[]).map((type) => (
              <TabsTrigger key={type} value={type}>
                {PAYMENT_TYPE_LABELS[type]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <Tabs value={method} onValueChange={(value) => onMethodChange(value as PaymentMethod)}>
        <TabsList className="h-8 grid w-full grid-cols-3">
          <TabsTrigger value="cash">Cash</TabsTrigger>
          <TabsTrigger value="card">Card</TabsTrigger>
          <TabsTrigger value="upi">UPI</TabsTrigger>
        </TabsList>
      </Tabs>

      {paymentType === 'paid' && method === 'cash' && (
        <div className="flex items-center gap-3">
          <NumericInput
            id="amount-tendered"
            aria-label="Amount tendered"
            placeholder="Amount tendered"
            min={0}
            required={false}
            value={amountTendered}
            onChange={onAmountTenderedChange}
            className="flex-1"
          />
          <p className="flex-1 text-sm text-muted-foreground">
            Change due{' '}
            <span className={`text-base font-semibold ${change !== null && change < 0 ? 'text-destructive' : 'text-foreground'}`}>
              {change !== null ? change.toFixed(2) : '—'}
            </span>
          </p>
        </div>
      )}

      {(paymentType === 'partial' || paymentType === 'credit') && (
        <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
          {paymentType === 'partial' && (
            <div className="flex items-center gap-3">
              <NumericInput
                id="paid-now"
                aria-label="Paid today"
                placeholder="Paid today"
                min={0}
                max={total}
                required={false}
                value={paidNow}
                onChange={onPaidNowChange}
                className="flex-1"
              />
              <p className="flex-1 text-sm text-muted-foreground">
                Outstanding <span className="text-base font-semibold text-foreground">{outstanding.toFixed(2)}</span>
              </p>
            </div>
          )}
          {paymentType === 'credit' && (
            <p className="text-sm text-muted-foreground">
              Full amount of <span className="font-medium text-foreground">{total.toFixed(2)}</span> will be recorded as outstanding.
            </p>
          )}
          <Input
            id="due-date"
            aria-label="Due date"
            type="date"
            value={dueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
