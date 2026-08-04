import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomerPicker } from '@/features/pos/components/CustomerPicker';
import { DiscountInput } from '@/features/pos/components/DiscountInput';
import { TaxInput } from '@/features/pos/components/TaxInput';
import { PaymentMethodSelector } from '@/features/pos/components/PaymentMethodSelector';
import type { Customer } from '@/features/customers/api';
import type { CartLine } from '@/features/pos/hooks/useCart';
import type { CartTotals } from '@/features/pos/lib/calc';
import type { DiscountType, PaymentMethod, PaymentType } from '@/features/pos/api';

interface CheckoutPanelProps {
  lines: CartLine[];
  discountType: DiscountType;
  discountValue: number;
  onDiscountChange: (type: DiscountType, value: number) => void;
  taxPercentage: number;
  onTaxPercentageChange: (value: number) => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  paymentType: PaymentType;
  onPaymentTypeChange: (type: PaymentType) => void;
  outstandingEnabled: boolean;
  amountTendered: number | null;
  onAmountTenderedChange: (value: number | null) => void;
  paidNow: number | null;
  onPaidNowChange: (value: number | null) => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  customerName: string;
  onCustomerNameChange: (value: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (value: string) => void;
  totals: CartTotals;
  onCheckout: () => void;
  isSubmitting: boolean;
  error: string | null;
  onHold: () => void;
  isHolding: boolean;
  allowDiscounts: boolean;
  enableCustomerSelection: boolean;
  customerId: string | null;
  selectedCustomer: Customer | null;
  onCustomerSelect: (customer: Customer | null) => void;
}

export function CheckoutPanel({
  lines,
  discountType,
  discountValue,
  onDiscountChange,
  taxPercentage,
  onTaxPercentageChange,
  paymentMethod,
  onPaymentMethodChange,
  paymentType,
  onPaymentTypeChange,
  outstandingEnabled,
  amountTendered,
  onAmountTenderedChange,
  paidNow,
  onPaidNowChange,
  dueDate,
  onDueDateChange,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  totals,
  onCheckout,
  isSubmitting,
  error,
  onHold,
  isHolding,
  allowDiscounts,
  enableCustomerSelection,
  customerId,
  selectedCustomer,
  onCustomerSelect,
}: CheckoutPanelProps) {
  const requiresCustomer = outstandingEnabled && paymentType !== 'paid';
  const canCheckout =
    lines.length > 0 &&
    (paymentType !== 'paid' || paymentMethod !== 'cash' || (amountTendered !== null && amountTendered >= totals.total)) &&
    (!requiresCustomer || (!!customerId && !!dueDate));

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto scrollbar-thin">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Customer</Label>
        {enableCustomerSelection || requiresCustomer ? (
          <>
            <CustomerPicker customerId={customerId} onSelect={onCustomerSelect} />
            {requiresCustomer && !customerId && (
              <p className="text-xs text-destructive">A customer must be selected for a partial or credit sale.</p>
            )}
            {requiresCustomer && selectedCustomer && !selectedCustomer.is_credit_enabled && (
              <p className="text-xs text-destructive">'{selectedCustomer.name}' is not enabled for credit sales — check Customer Settings.</p>
            )}
            {requiresCustomer && selectedCustomer?.is_credit_enabled && selectedCustomer.credit_limit != null && (
              <p className="text-xs text-muted-foreground">
                Current outstanding: {selectedCustomer.outstanding_amount.toFixed(2)} / limit {selectedCustomer.credit_limit.toFixed(2)}
              </p>
            )}
          </>
        ) : (
          <div className="space-y-1.5">
            <div className="relative">
              <Input
                placeholder="Walk-in Customer"
                value={customerName}
                onChange={(e) => onCustomerNameChange(e.target.value)}
                className="pr-8 text-xs"
              />
              <User className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <Input
              placeholder="Phone (optional)"
              value={customerPhone}
              onChange={(e) => onCustomerPhoneChange(e.target.value)}
              className="text-xs"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        {allowDiscounts && <DiscountInput discountType={discountType} discountValue={discountValue} onChange={onDiscountChange} />}
        <TaxInput value={taxPercentage} onChange={onTaxPercentageChange} />

        <div className="grid grid-cols-[1fr_1fr_1.3fr] gap-1.5 text-center">
          <div className="rounded-lg border bg-muted/30 px-1 py-1.5">
            <p className="text-xs text-muted-foreground">Discount</p>
            <p className="text-xs font-semibold">₹{totals.discountAmount.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-1 py-1.5">
            <p className="text-xs text-muted-foreground">Tax ({taxPercentage}%)</p>
            <p className="text-xs font-semibold">₹{totals.taxAmount.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-[#6C47FF]/30 bg-[#6C47FF]/5 px-1 py-1.5">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xs font-bold text-[#6C47FF]">₹{totals.total.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <PaymentMethodSelector
        method={paymentMethod}
        onMethodChange={onPaymentMethodChange}
        paymentType={paymentType}
        onPaymentTypeChange={onPaymentTypeChange}
        showPaymentType={outstandingEnabled}
        amountTendered={amountTendered}
        onAmountTenderedChange={onAmountTenderedChange}
        paidNow={paidNow}
        onPaidNowChange={onPaidNowChange}
        dueDate={dueDate}
        onDueDateChange={onDueDateChange}
        total={totals.total}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="mt-auto flex gap-2 border-t pt-3">
        <Button
          variant="outline"
          className="rounded-xl border-[#6C47FF] text-xs text-[#6C47FF] hover:bg-[#6C47FF]/5"
          disabled={lines.length === 0 || isHolding || isSubmitting}
          onClick={onHold}
        >
          {isHolding ? 'Holding…' : 'Hold Bill'}
        </Button>
        <Button
          className="h-auto min-h-9 flex-1 rounded-xl bg-[#6C47FF] py-2 text-xs leading-tight whitespace-normal text-white hover:bg-[#5b3ce6]"
          disabled={!canCheckout || isSubmitting}
          onClick={onCheckout}
        >
          {isSubmitting ? 'Processing…' : `Checkout · ₹${totals.total.toFixed(2)}`}
        </Button>
      </div>
    </div>
  );
}
