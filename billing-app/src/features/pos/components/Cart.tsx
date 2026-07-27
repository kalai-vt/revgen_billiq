import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CartLineItem } from '@/features/pos/components/CartLineItem';
import { CustomerPicker } from '@/features/pos/components/CustomerPicker';
import { DiscountInput } from '@/features/pos/components/DiscountInput';
import { TaxInput } from '@/features/pos/components/TaxInput';
import { PaymentMethodSelector } from '@/features/pos/components/PaymentMethodSelector';
import type { Customer } from '@/features/customers/api';
import type { CartLine } from '@/features/pos/hooks/useCart';
import type { CartTotals } from '@/features/pos/lib/calc';
import type { DiscountType, PaymentMethod, PaymentType } from '@/features/pos/api';

interface CartProps {
  lines: CartLine[];
  onQuantityChange: (productId: string, quantity: number) => void;
  onPriceChange: (productId: string, price: number | null) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  canOverridePrice: boolean;
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

export function Cart({
  lines,
  onQuantityChange,
  onPriceChange,
  onRemove,
  onClear,
  canOverridePrice,
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
}: CartProps) {
  const requiresCustomer = outstandingEnabled && paymentType !== 'paid';
  const canCheckout =
    lines.length > 0 &&
    (paymentType !== 'paid' || paymentMethod !== 'cash' || (amountTendered !== null && amountTendered >= totals.total)) &&
    (!requiresCustomer || (!!customerId && !!dueDate));

  function handleClear() {
    if (lines.length === 0) return;
    if (window.confirm('Clear all items from the cart?')) onClear();
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          Current Cart <span className="font-normal text-muted-foreground">({lines.length} item{lines.length === 1 ? '' : 's'})</span>
        </h2>
        <button
          type="button"
          onClick={handleClear}
          disabled={lines.length === 0}
          className="text-sm font-medium text-destructive hover:underline disabled:pointer-events-none disabled:opacity-40"
        >
          Clear Cart
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
        {lines.length === 0 ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ShoppingCart className="size-8" />
            <p className="text-sm">Cart is empty. Search and add products.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Rate (₹)</TableHead>
                <TableHead className="text-right">Amount (₹)</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <CartLineItem
                  key={line.product.id}
                  line={line}
                  onQuantityChange={(qty) => onQuantityChange(line.product.id, qty)}
                  onPriceChange={(price) => onPriceChange(line.product.id, price)}
                  onRemove={() => onRemove(line.product.id)}
                  canOverridePrice={canOverridePrice}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t pt-3">
        {(enableCustomerSelection || requiresCustomer) && (
          <div className="space-y-1">
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
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {!requiresCustomer && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Customer (optional)</Label>
              <Input placeholder="Enter name" value={customerName} onChange={(e) => onCustomerNameChange(e.target.value)} />
              <Input placeholder="Phone (optional)" value={customerPhone} onChange={(e) => onCustomerPhoneChange(e.target.value)} />
            </div>
          )}

          <div className={`space-y-2 ${requiresCustomer ? 'md:col-span-2' : ''}`}>
            {allowDiscounts && <DiscountInput discountType={discountType} discountValue={discountValue} onChange={onDiscountChange} />}
            <TaxInput value={taxPercentage} onChange={onTaxPercentageChange} />
          </div>

          <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>₹{totals.subtotal.toFixed(2)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span>-₹{totals.discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Tax ({taxPercentage}%)</span>
              <span>₹{totals.taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 text-base font-semibold">
              <span>Total</span>
              <span>₹{totals.total.toFixed(2)}</span>
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-xl border-[#6C47FF] text-[#6C47FF] hover:bg-[#6C47FF]/5"
            disabled={lines.length === 0 || isHolding || isSubmitting}
            onClick={onHold}
          >
            {isHolding ? 'Holding…' : 'Hold Bill'}
          </Button>
          <Button
            className="flex-1 rounded-xl bg-[#6C47FF] text-white hover:bg-[#5b3ce6]"
            size="lg"
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
