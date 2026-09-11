import { ChefHat, Printer, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomerPicker } from '@/features/pos/components/CustomerPicker';
import { DiscountInput } from '@/features/pos/components/DiscountInput';
import { TaxInput } from '@/features/pos/components/TaxInput';
import { PaymentMethodSelector } from '@/features/pos/components/PaymentMethodSelector';
import { TableSelector, NO_TABLE } from '@/features/pos/components/TableSelector';
import { getVisiblePaymentMethods, getVisiblePaymentTypes } from '@/features/pos/lib/checkoutLayout';
import type { CheckoutElementKey } from '@/features/pos/lib/checkoutElements';
import { useFeatureFlag } from '@/features/settings/hooks/useFeatureFlags';
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
  paymentReference: string;
  onPaymentReferenceChange: (value: string) => void;
  /** Dine-in: which table this cart belongs to, or NO_TABLE for an ordinary counter sale. */
  tableId: string;
  onTableIdChange: (value: string) => void;
  /** True while the cart is a view over a table's server-side order. */
  isTableMode: boolean;
  onPrintKot: () => void;
  isPrintingKot: boolean;
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
  /** Prints a Provisional/Order Bill for the current cart — a preview the customer can review and
   * pay against before Checkout. Never calls the backend: no invoice, payment, or inventory
   * change happens until the cashier clicks Checkout separately. */
  onPrintOrderBill: () => void;
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
  paymentReference,
  onPaymentReferenceChange,
  tableId,
  onTableIdChange,
  isTableMode,
  onPrintKot,
  isPrintingKot,
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
  onPrintOrderBill,
  allowDiscounts,
  enableCustomerSelection,
  customerId,
  selectedCustomer,
  onCustomerSelect,
  checkoutConfig,
}: CheckoutPanelProps) {
  // Print Order Bill renders through the Invoice Designer template — hide it when that feature
  // isn't available on this tenant's plan rather than opening a tab that's guaranteed to fail.
  const invoiceDesignerEnabled = useFeatureFlag('invoice_designer');
  const tableManagementEnabled = useFeatureFlag('table_management');
  const kotEnabled = useFeatureFlag('kot');
  // Both switches have to agree: the tenant's module has to be on AND the element left enabled.
  const showPrintOrderBill = invoiceDesignerEnabled && checkoutConfig.print_order_bill;
  const showPrintKot = kotEnabled && checkoutConfig.print_kot;
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

      {/* Total = Sale Amount - Discount + Tax — pure relabeling/redisplay of the same
       * calc.ts-computed totals used everywhere else (checkout submission, held bills, the
       * provisional bill); no calculation changes here. A compact label/value list rather than
       * bordered tiles, to leave Current Cart as much vertical room as possible. */}
      <div className="space-y-0.5 rounded-lg border bg-muted/20 px-2.5 py-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Sale Amount</span>
          <span className="font-medium tabular-nums">₹{totals.subtotal.toFixed(2)}</span>
        </div>
        {showDiscount && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span className="font-medium tabular-nums text-destructive">-₹{totals.discountAmount.toFixed(2)}</span>
          </div>
        )}
        {showTax && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Tax ({taxPercentage}%)</span>
            <span className="font-medium tabular-nums">+₹{totals.taxAmount.toFixed(2)}</span>
          </div>
        )}
        {/* Total is mandatory — always visible, never configurable. */}
        <div className="mt-1 flex items-center justify-between border-t pt-1">
          <span className="font-semibold text-primary">Total</span>
          <span className="font-bold tabular-nums text-primary">₹{totals.total.toFixed(2)}</span>
        </div>
      </div>

      {checkoutConfig.table && tableManagementEnabled && (
        <TableSelector value={tableId} onChange={onTableIdChange} />
      )}

      <PaymentMethodSelector
        method={paymentMethod}
        onMethodChange={onPaymentMethodChange}
        visiblePaymentMethods={visiblePaymentMethods}
        paymentType={paymentType}
        onPaymentTypeChange={onPaymentTypeChange}
        visiblePaymentTypes={visiblePaymentTypes}
        showPaymentType={outstandingEnabled}
        paymentReference={paymentReference}
        onPaymentReferenceChange={onPaymentReferenceChange}
        showPaymentReference={checkoutConfig.payment_reference}
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

      {/* Checkout is mandatory — always visible, never configurable. Hold Bill is optional.
       * Print Order Bill is its own row — a pre-checkout step, distinct from the final actions
       * below it, that never touches the backend (see onPrintOrderBill's own doc comment). */}
      <div className="mt-auto flex flex-col gap-2 border-t pt-3">
        {(showPrintOrderBill || showPrintKot) && (
          <div className="flex gap-2">
            {showPrintOrderBill && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-xl text-xs"
                disabled={lines.length === 0}
                onClick={onPrintOrderBill}
              >
                <Printer className="size-4" />
                Print Order Bill
              </Button>
            )}
            {showPrintKot && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-xl text-xs"
                // A KOT with no table is a ticket the kitchen can't deliver against, so the
                // table has to be picked first.
                disabled={lines.length === 0 || tableId === NO_TABLE || isPrintingKot}
                title={tableId === NO_TABLE ? 'Pick a table first — a kitchen ticket needs one' : undefined}
                onClick={onPrintKot}
              >
                <ChefHat className="size-4" />
                {isPrintingKot ? 'Sending…' : 'Print Kitchen KOT'}
              </Button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          {/* A table's order is already held — it lives on the server and survives a refresh, which
              is what Hold Bill exists to do for a counter sale. Offering it here produced a
              duplicate held bill AND emptied the table's order, stranding the table as occupied
              with nothing on it. */}
          {checkoutConfig.hold_bill && !isTableMode && (
            <Button
              variant="outline"
              className="rounded-xl border-primary text-xs text-primary hover:bg-primary/5"
              disabled={lines.length === 0 || isHolding || isSubmitting}
              onClick={onHold}
            >
              {isHolding ? 'Holding…' : 'Hold Bill'}
            </Button>
          )}
          <Button
            className="h-auto min-h-9 flex-1 rounded-xl bg-primary py-2 text-xs leading-tight whitespace-normal text-primary-foreground hover:bg-primary/90"
            disabled={!canCheckout || isSubmitting}
            onClick={onCheckout}
          >
            {isSubmitting ? 'Processing…' : `Checkout · ₹${totals.total.toFixed(2)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
