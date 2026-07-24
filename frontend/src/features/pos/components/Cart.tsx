import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShoppingCart } from 'lucide-react';
import { CartLineItem } from '@/features/pos/components/CartLineItem';
import { CustomerPicker } from '@/features/pos/components/CustomerPicker';
import { DiscountInput } from '@/features/pos/components/DiscountInput';
import { TaxInput } from '@/features/pos/components/TaxInput';
import { PaymentMethodSelector } from '@/features/pos/components/PaymentMethodSelector';
import type { Customer } from '@/features/customers/api';
import type { CartLine } from '@/features/pos/hooks/useCart';
import type { CartTotals } from '@/features/pos/lib/calc';
import type { DiscountType, PaymentMethod } from '@/features/pos/api';

interface CartProps {
  lines: CartLine[];
  onQuantityChange: (productId: string, quantity: number) => void;
  onPriceChange: (productId: string, price: number | null) => void;
  onRemove: (productId: string) => void;
  canOverridePrice: boolean;
  discountType: DiscountType;
  discountValue: number;
  onDiscountChange: (type: DiscountType, value: number) => void;
  taxPercentage: number;
  onTaxPercentageChange: (value: number) => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  amountTendered: number | null;
  onAmountTenderedChange: (value: number | null) => void;
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
  onCustomerSelect: (customer: Customer | null) => void;
}

export function Cart({
  lines,
  onQuantityChange,
  onPriceChange,
  onRemove,
  canOverridePrice,
  discountType,
  discountValue,
  onDiscountChange,
  taxPercentage,
  onTaxPercentageChange,
  paymentMethod,
  onPaymentMethodChange,
  amountTendered,
  onAmountTenderedChange,
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
  onCustomerSelect,
}: CartProps) {
  const canCheckout =
    lines.length > 0 && (paymentMethod !== 'cash' || (amountTendered !== null && amountTendered >= totals.total));

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ShoppingCart className="size-8" />
            <p className="text-sm">Cart is empty. Search and add products.</p>
          </div>
        ) : (
          lines.map((line) => (
            <CartLineItem
              key={line.product.id}
              line={line}
              onQuantityChange={(qty) => onQuantityChange(line.product.id, qty)}
              onPriceChange={(price) => onPriceChange(line.product.id, price)}
              onRemove={() => onRemove(line.product.id)}
              canOverridePrice={canOverridePrice}
            />
          ))
        )}
      </div>

      <div className="space-y-3 border-t pt-3">
        {enableCustomerSelection && <CustomerPicker customerId={customerId} onSelect={onCustomerSelect} />}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="customer-name" className="text-xs text-muted-foreground">
              Customer name (optional)
            </Label>
            <Input id="customer-name" value={customerName} onChange={(e) => onCustomerNameChange(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="customer-phone" className="text-xs text-muted-foreground">
              Phone (optional)
            </Label>
            <Input id="customer-phone" value={customerPhone} onChange={(e) => onCustomerPhoneChange(e.target.value)} />
          </div>
        </div>

        {allowDiscounts && <DiscountInput discountType={discountType} discountValue={discountValue} onChange={onDiscountChange} />}
        <TaxInput value={taxPercentage} onChange={onTaxPercentageChange} />

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{totals.subtotal.toFixed(2)}</span>
          </div>
          {totals.discountAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span>-{totals.discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>Tax ({taxPercentage}%)</span>
            <span>{totals.taxAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span>{totals.total.toFixed(2)}</span>
          </div>
        </div>

        <PaymentMethodSelector
          method={paymentMethod}
          onMethodChange={onPaymentMethodChange}
          amountTendered={amountTendered}
          onAmountTenderedChange={onAmountTenderedChange}
          total={totals.total}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={lines.length === 0 || isHolding || isSubmitting}
            onClick={onHold}
          >
            {isHolding ? 'Holding…' : 'Hold bill'}
          </Button>
          <Button className="flex-1" size="lg" disabled={!canCheckout || isSubmitting} onClick={onCheckout}>
            {isSubmitting ? 'Processing…' : `Checkout · ${totals.total.toFixed(2)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
