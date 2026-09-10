import { NumericInput } from '@/components/ui/numeric-input';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { PaymentMethod, PaymentType } from '@/features/pos/api';

interface PaymentMethodSelectorProps {
  method: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  visiblePaymentMethods: PaymentMethod[];
  paymentType: PaymentType;
  onPaymentTypeChange: (type: PaymentType) => void;
  visiblePaymentTypes: PaymentType[];
  /** The UPI/card transaction id, for reconciling this sale against a bank statement later.
   * Cash has none, so the field only shows for the other methods. */
  paymentReference: string;
  onPaymentReferenceChange: (value: string) => void;
  showPaymentReference: boolean;
  amountTendered: number | null;
  onAmountTenderedChange: (value: number | null) => void;
  showAmountTendered: boolean;
  showChangeDue: boolean;
  paidNow: number | null;
  onPaidNowChange: (value: number | null) => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  total: number;
  /** Hides the Paid in Full / Partially Paid / Pay Later tabs entirely — used when the tenant's
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
  if (options.length === 0) return null;
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            'h-auto min-h-8 rounded-lg border px-1 py-1 text-xs leading-tight font-medium transition-colors',
            value === option
              ? 'border-primary bg-primary text-primary-foreground'
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
  visiblePaymentMethods,
  paymentType,
  onPaymentTypeChange,
  visiblePaymentTypes,
  paymentReference,
  onPaymentReferenceChange,
  showPaymentReference,
  amountTendered,
  onAmountTenderedChange,
  showAmountTendered,
  showChangeDue,
  paidNow,
  onPaidNowChange,
  dueDate,
  onDueDateChange,
  total,
  showPaymentType = true,
}: PaymentMethodSelectorProps) {
  const change = paymentType === 'paid' && method === 'cash' && amountTendered !== null ? amountTendered - total : null;
  const outstanding = paymentType === 'credit' ? total : Math.max(0, total - (paidNow ?? 0));
  const showCashDetails = paymentType === 'paid' && method === 'cash' && (showAmountTendered || showChangeDue);
  // Cash has no transaction id to record, and a credit sale has not been paid yet — there is
  // nothing to reference until the collection is taken, which has its own reference field.
  const showReference = showPaymentReference && method !== 'cash' && paymentType !== 'credit';

  return (
    <div className="space-y-1">
      {showPaymentType && (
        <SegmentedButtons options={visiblePaymentTypes} labels={PAYMENT_TYPE_LABELS} value={paymentType} onChange={onPaymentTypeChange} />
      )}

      <SegmentedButtons options={visiblePaymentMethods} labels={PAYMENT_METHOD_LABELS} value={method} onChange={onMethodChange} />

      {showCashDetails && (
        <div className="space-y-1 rounded-lg border bg-muted/20 p-1.5">
          {showAmountTendered && (
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="amount-tendered" className="text-xs text-muted-foreground">
                Amount Tendered
              </label>
              <NumericInput
                id="amount-tendered"
                min={0}
                required={false}
                value={amountTendered}
                onChange={onAmountTenderedChange}
                placeholder="0"
                className="h-7 w-28 border border-input bg-background px-2 text-right text-xs font-medium"
              />
            </div>
          )}
          {showChangeDue && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Change Due</p>
              <p className={cn('text-xs font-semibold', change !== null && change < 0 ? 'text-destructive' : 'text-primary')}>
                {change !== null ? `₹${change.toFixed(2)}` : '—'}
              </p>
            </div>
          )}
        </div>
      )}

      {showReference && (
        <div className="rounded-lg border bg-muted/20 p-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="payment-reference" className="text-xs text-muted-foreground">
              {method === 'upi' ? 'UPI Txn ID' : 'Approval Code'}
            </label>
            <Input
              id="payment-reference"
              value={paymentReference}
              maxLength={80}
              onChange={(event) => onPaymentReferenceChange(event.target.value)}
              placeholder="Optional"
              className="h-7 w-40 px-2 text-right text-xs font-medium"
            />
          </div>
        </div>
      )}

      {(paymentType === 'partial' || paymentType === 'credit') && (
        <div className="space-y-1 rounded-lg border bg-muted/20 p-1.5">
          {paymentType === 'partial' && (
            <>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="paid-now" className="text-xs text-muted-foreground">
                  Paid Today
                </label>
                <NumericInput
                  id="paid-now"
                  min={0}
                  max={total}
                  required={false}
                  value={paidNow}
                  onChange={onPaidNowChange}
                  placeholder="0"
                  className="h-7 w-28 border border-input bg-background px-2 text-right text-xs font-medium"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-xs font-semibold text-primary">₹{outstanding.toFixed(2)}</p>
              </div>
            </>
          )}
          {paymentType === 'credit' && (
            <p className="text-xs text-muted-foreground">
              Full amount of <span className="font-medium text-foreground">₹{total.toFixed(2)}</span> will be recorded as outstanding.
            </p>
          )}
          <Input
            id="due-date"
            aria-label="Due date"
            type="date"
            value={dueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
            className="text-xs"
          />
        </div>
      )}
    </div>
  );
}
