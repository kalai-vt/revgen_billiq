import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomerPicker } from '@/features/pos/components/CustomerPicker';
import { DiscountInput } from '@/features/pos/components/DiscountInput';
import { TaxInput } from '@/features/pos/components/TaxInput';
import { PaymentMethodSelector } from '@/features/pos/components/PaymentMethodSelector';
import { getVisiblePaymentMethods, getVisiblePaymentTypes } from '@/features/pos/lib/checkoutLayout';
import type { CheckoutElementKey } from '@/features/pos/lib/checkoutElements';
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
  /** Settings > Billing Settings > Checkout Elements — resolved per-tenant visibility. Total and
   * Checkout are never in here; they're mandatory and rendered unconditionally below. */
  checkoutConfig: Record<CheckoutElementKey, boolean>;
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
  checkoutConfig,
}: CheckoutPanelProps) {
  const requiresCustomer = outstandingEnabled && paymentType !== 'paid';
  // Amount tendered is a cashier balance/change aid only — it must never block checkout, even
  // for the paid-in-full + cash default.
  const canCheckout = lines.length > 0 && (!requiresCustomer || (!!customerId && !!dueDate));

  const showDiscount = allowDiscounts && checkoutConfig.discount;
  const showTax = checkoutConfig.tax;
  // The customer picker is functionally required for a partial/credit sale (the backend rejects
  // one without a customer_id) — it stays regardless of the "Customer" toggle, which only governs
  // the optional walk-in name/phone capture on an ordinary paid sale (requirement: hiding a UI
  // element must never change underlying business logic).
  const showCustomerPicker = requiresCustomer || enableCustomerSelection;
  const showCustomerName = !showCustomerPicker && checkoutConfig.customer;
  const showCustomerPhone = !showCustomerPicker && checkoutConfig.phone;

  const visiblePaymentTypes = getVisiblePaymentTypes(checkoutConfig, outstandingEnabled);
  const visiblePaymentMethods = getVisiblePaymentMethods(checkoutConfig);

  return (
    <div className="flex h-full flex-col gap-1.5 overflow-y-auto scrollbar-thin">
      {(showCustomerPicker || showCustomerName || showCustomerPhone) && (
        <div className="space-y-1">
          {showCustomerPicker ? (
            <>
              <CustomerPicker customerId={customerId} onSelect={onCustomerSelect} />
              {requiresCustomer && !customerId && (
                <p className="text-xs text-destructive">A customer must be selected for a partial or credit sale.</p>
              )}
              {requiresCustomer && selectedCustomer && selectedCustomer.credit_limit != null && (
                <p className="text-xs text-muted-foreground">
                  Current outstanding: {selectedCustomer.outstanding_amount.toFixed(2)} / limit {selectedCustomer.credit_limit.toFixed(2)}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-1.5">
              {showCustomerName && (
                <>
                  <Label className="text-xs text-muted-foreground">Customer</Label>
                  <div className="relative">
                    <Input
                      placeholder="Walk-in Customer"
                      value={customerName}
                      onChange={(e) => onCustomerNameChange(e.target.value)}
                      className="pr-8 text-xs"
                    />
                    <User className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </>
              )}
              {showCustomerPhone && (
                <Input
                  placeholder="Phone (optional)"
                  value={customerPhone}
                  onChange={(e) => onCustomerPhoneChange(e.target.value)}
                  className="text-xs"
                />
              )}
            </div>
          )}
        </div>
      )}

      {(showDiscount || showTax) && (
        <div className="space-y-1">
          {showDiscount && (
            <div className="grid grid-cols-[8rem_6rem] items-center gap-x-2 rounded-lg border bg-muted/20 p-1.5">
              <DiscountInput discountType={discountType} discountValue={discountValue} onChange={onDiscountChange} />
            </div>
          )}
          {showTax && (
            <div className="grid grid-cols-[8rem_6rem] items-center gap-x-2 rounded-lg border bg-muted/20 p-1.5">
              <TaxInput value={taxPercentage} onChange={onTaxPercentageChange} />
            </div>
          )}
        </div>
      )}

      <div
        className="grid gap-1.5 text-center"
        style={{ gridTemplateColumns: `${showDiscount ? '1fr ' : ''}${showTax ? '1fr ' : ''}1.3fr` }}
      >
        {showDiscount && (
          <div className="rounded-lg border bg-muted/30 px-1 py-1">
            <p className="text-xs text-muted-foreground">Discount</p>
            <p className="text-xs font-semibold">₹{totals.discountAmount.toFixed(2)}</p>
          </div>
        )}
        {showTax && (
          <div className="rounded-lg border bg-muted/30 px-1 py-1">
            <p className="text-xs text-muted-foreground">Tax ({taxPercentage}%)</p>
            <p className="text-xs font-semibold">₹{totals.taxAmount.toFixed(2)}</p>
          </div>
        )}
        {/* Total is mandatory — always visible, never configurable. */}
        <div className="rounded-lg border border-[#6C47FF]/30 bg-[#6C47FF]/5 px-1 py-1">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xs font-bold text-[#6C47FF]">₹{totals.total.toFixed(2)}</p>
        </div>
      </div>

      <PaymentMethodSelector
        method={paymentMethod}
        onMethodChange={onPaymentMethodChange}
        visiblePaymentMethods={visiblePaymentMethods}
        paymentType={paymentType}
        onPaymentTypeChange={onPaymentTypeChange}
        visiblePaymentTypes={visiblePaymentTypes}
        showPaymentType={outstandingEnabled}
        amountTendered={amountTendered}
        onAmountTenderedChange={onAmountTenderedChange}
        showAmountTendered={checkoutConfig.amount_tendered}
        showChangeDue={checkoutConfig.change_due}
        paidNow={paidNow}
        onPaidNowChange={onPaidNowChange}
        dueDate={dueDate}
        onDueDateChange={onDueDateChange}
        total={totals.total}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Checkout is mandatory — always visible, never configurable. Hold Bill is optional. */}
      <div className="mt-auto flex gap-2 border-t pt-3">
        {checkoutConfig.hold_bill && (
          <Button
            variant="outline"
            className="rounded-xl border-[#6C47FF] text-xs text-[#6C47FF] hover:bg-[#6C47FF]/5"
            disabled={lines.length === 0 || isHolding || isSubmitting}
            onClick={onHold}
          >
            {isHolding ? 'Holding…' : 'Hold Bill'}
          </Button>
        )}
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
