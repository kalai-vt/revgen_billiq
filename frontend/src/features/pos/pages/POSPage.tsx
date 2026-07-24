import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Cart } from '@/features/pos/components/Cart';
import { HeldBillsDialog } from '@/features/pos/components/HeldBillsDialog';
import { InvoiceSuccessDialog } from '@/features/pos/components/InvoiceSuccessDialog';
import { ProductSearchPanel } from '@/features/pos/components/ProductSearchPanel';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useCart } from '@/features/pos/hooks/useCart';
import { useCreateInvoice } from '@/features/pos/hooks/useCreateInvoice';
import { useKeyboardShortcuts } from '@/features/pos/hooks/useKeyboardShortcuts';
import { computeTotals } from '@/features/pos/lib/calc';
import * as posApi from '@/features/pos/api';
import * as settingsApi from '@/features/settings/api';
import type { Customer } from '@/features/customers/api';
import type { DiscountType, HeldBill, Invoice, PaymentMethod } from '@/features/pos/api';
import { ApiError } from '@/lib/api-client';

export function POSPage() {
  const cart = useCart();
  const { canOverridePrice } = useAuth();
  const { data: preferences } = useQuery({
    queryKey: ['business-preferences'],
    queryFn: settingsApi.getBusinessPreferences,
  });

  const [discountType, setDiscountType] = useState<DiscountType>(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [taxPercentage, setTaxPercentage] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountTendered, setAmountTendered] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
  const [heldBillsOpen, setHeldBillsOpen] = useState(false);

  const createInvoice = useCreateInvoice();
  const queryClient = useQueryClient();
  const totals = computeTotals(cart.lines, discountType, discountValue, taxPercentage);

  // Seed defaults from business preferences once, on first load — a fresh cart with no
  // interaction yet.
  useEffect(() => {
    if (preferences && cart.lines.length === 0 && discountType === null) {
      setTaxPercentage(preferences.default_tax_percent);
      setPaymentMethod(preferences.default_payment_method);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences]);

  function handleCustomerSelect(customer: Customer | null) {
    setCustomerId(customer?.id ?? null);
    if (customer) {
      setCustomerName(customer.name);
      setCustomerPhone(customer.mobile ?? '');
    }
  }

  const holdMutation = useMutation({
    mutationFn: () =>
      posApi.holdBill({
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        lines: cart.lines.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
          unit_price: line.overridePrice,
        })),
        discount_type: discountType,
        discount_value: discountValue,
        tax_percentage: taxPercentage,
        payment_method: paymentMethod,
      }),
    onSuccess: () => {
      toast.success('Bill held');
      queryClient.invalidateQueries({ queryKey: ['held-bills'] });
      resetForNewSale();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function resumeHeldBill(heldBill: HeldBill) {
    cart.setLines(
      heldBill.lines.map((line) => ({
        product: line.product,
        quantity: line.quantity,
        overridePrice: line.unit_price,
      })),
    );
    setDiscountType(heldBill.discount_type);
    setDiscountValue(heldBill.discount_value);
    setTaxPercentage(heldBill.tax_percentage);
    setPaymentMethod(heldBill.payment_method);
    setCustomerName(heldBill.customer_name ?? '');
    setCustomerPhone(heldBill.customer_phone ?? '');
    setHeldBillsOpen(false);
    posApi.deleteHeldBill(heldBill.id).then(() => queryClient.invalidateQueries({ queryKey: ['held-bills'] }));
  }

  function handleDiscountChange(type: DiscountType, value: number) {
    setDiscountType(type);
    setDiscountValue(value);
  }

  function resetForNewSale() {
    cart.clear();
    setDiscountType(null);
    setDiscountValue(0);
    setTaxPercentage(preferences?.default_tax_percent ?? 0);
    setPaymentMethod(preferences?.default_payment_method ?? 'cash');
    setAmountTendered(null);
    setCustomerId(null);
    setCustomerName('');
    setCustomerPhone('');
    setError(null);
    setCompletedInvoice(null);
  }

  async function handleCheckout() {
    setError(null);
    try {
      const invoice = await createInvoice.mutateAsync({
        customer_id: customerId,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        lines: cart.lines.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
          unit_price: line.overridePrice,
        })),
        discount_type: discountType,
        discount_value: discountValue,
        tax_percentage: taxPercentage,
        payment_method: paymentMethod,
        amount_tendered: paymentMethod === 'cash' ? amountTendered : null,
      });
      setCompletedInvoice(invoice);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }

  const canCheckout =
    cart.lines.length > 0 &&
    !createInvoice.isPending &&
    !completedInvoice &&
    !heldBillsOpen &&
    (paymentMethod !== 'cash' || (amountTendered !== null && amountTendered >= totals.total));
  useKeyboardShortcuts({ onCheckout: handleCheckout, canCheckout });

  return (
    <div className="grid h-[calc(100vh-6rem)] grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
      <Card className="min-h-0 p-4">
        <div className="mb-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setHeldBillsOpen(true)}>
            <PackageOpen className="size-4" />
            Held bills
          </Button>
        </div>
        <ProductSearchPanel onAdd={cart.addProduct} />
      </Card>
      <Card className="min-h-0 p-4">
        <Cart
          lines={cart.lines}
          onQuantityChange={cart.setQuantity}
          onPriceChange={cart.setPrice}
          onRemove={cart.removeLine}
          canOverridePrice={canOverridePrice}
          discountType={discountType}
          discountValue={discountValue}
          onDiscountChange={handleDiscountChange}
          taxPercentage={taxPercentage}
          onTaxPercentageChange={setTaxPercentage}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          amountTendered={amountTendered}
          onAmountTenderedChange={setAmountTendered}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          customerPhone={customerPhone}
          onCustomerPhoneChange={setCustomerPhone}
          onHold={() => holdMutation.mutate()}
          isHolding={holdMutation.isPending}
          allowDiscounts={preferences?.allow_discounts ?? true}
          enableCustomerSelection={preferences?.enable_customer_selection ?? false}
          customerId={customerId}
          onCustomerSelect={handleCustomerSelect}
          totals={totals}
          onCheckout={handleCheckout}
          isSubmitting={createInvoice.isPending}
          error={error}
        />
      </Card>

      <InvoiceSuccessDialog
        invoice={completedInvoice}
        onClose={resetForNewSale}
        autoPrint={preferences?.auto_print_after_checkout ?? false}
      />
      <HeldBillsDialog open={heldBillsOpen} onClose={() => setHeldBillsOpen(false)} onResume={resumeHeldBill} />
    </div>
  );
}
