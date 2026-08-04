import { NumericInput } from '@/components/ui/numeric-input';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
};

function SegmentedButtons<T extends string>({
  options,
  labels,
  value,
  onChange,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            'h-auto min-h-8 rounded-lg border px-1 py-1 text-xs leading-tight font-medium transition-colors',
            value === option
              ? 'border-[#6C47FF] bg-[#6C47FF] text-white'
              : 'border-border bg-background text-foreground hover:bg-muted',
          )}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

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
    <div className="space-y-2">
      {showPaymentType && (
        <SegmentedButtons
          options={['paid', 'partial', 'credit']}
          labels={PAYMENT_TYPE_LABELS}
          value={paymentType}
          onChange={onPaymentTypeChange}
        />
      )}

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Payment Method</p>
        <SegmentedButtons
          options={['cash', 'card', 'upi']}
          labels={PAYMENT_METHOD_LABELS}
          value={method}
          onChange={onMethodChange}
        />
      </div>

      {paymentType === 'paid' && method === 'cash' && (
        <div className="space-y-1 rounded-lg border bg-muted/20 p-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="amount-tendered" className="text-sm text-muted-foreground">
              Amount Tendered
            </label>
            <NumericInput
              id="amount-tendered"
              min={0}
              required={false}
              value={amountTendered}
              onChange={onAmountTenderedChange}
              className="h-7 w-28 border-transparent bg-transparent px-1 text-right font-medium shadow-none"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Change Due</p>
            <p className={cn('text-sm font-semibold', change !== null && change < 0 ? 'text-destructive' : 'text-[#6C47FF]')}>
              {change !== null ? `₹${change.toFixed(2)}` : '—'}
            </p>
          </div>
        </div>
      )}

      {(paymentType === 'partial' || paymentType === 'credit') && (
        <div className="space-y-1.5 rounded-lg border bg-muted/20 p-2">
          {paymentType === 'partial' && (
            <>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="paid-now" className="text-sm text-muted-foreground">
                  Paid Today
                </label>
                <NumericInput
                  id="paid-now"
                  min={0}
                  max={total}
                  required={false}
                  value={paidNow}
                  onChange={onPaidNowChange}
                  className="h-7 w-28 border-transparent bg-transparent px-1 text-right font-medium shadow-none"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-sm font-semibold text-[#6C47FF]">₹{outstanding.toFixed(2)}</p>
              </div>
            </>
          )}
          {paymentType === 'credit' && (
            <p className="text-sm text-muted-foreground">
              Full amount of <span className="font-medium text-foreground">₹{total.toFixed(2)}</span> will be recorded as outstanding.
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
