import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PackageOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CartPanel } from '@/features/pos/components/CartPanel';
import { CheckoutPanel } from '@/features/pos/components/CheckoutPanel';
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
import { useFeatureFlag } from '@/features/settings/hooks/useFeatureFlags';
import type { Customer } from '@/features/customers/api';
import type { DiscountType, HeldBill, Invoice, PaymentMethod, PaymentType } from '@/features/pos/api';
import { ApiError } from '@/lib/api-client';

export function POSPage() {
  const cart = useCart();
  const { canOverridePrice } = useAuth();
  const outstandingEnabled = useFeatureFlag('payments_credit');
  const { data: preferences } = useQuery({
    queryKey: ['business-preferences'],
    queryFn: settingsApi.getBusinessPreferences,
  });
  const { data: heldBillsData } = useQuery({
    queryKey: ['held-bills'],
    queryFn: () => posApi.listHeldBills(),
    staleTime: 30_000,
  });

  const [discountType, setDiscountType] = useState<DiscountType>(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [taxPercentage, setTaxPercentage] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentType, setPaymentType] = useState<PaymentType>('paid');
  const [amountTendered, setAmountTendered] = useState<number | null>(null);
  const [paidNow, setPaidNow] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
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

  // Outstanding module gates Partial/Credit sales entirely — if it's off (or gets turned off
  // mid-sale), always fall back to a fully-paid checkout.
  useEffect(() => {
    if (!outstandingEnabled && paymentType !== 'paid') {
      setPaymentType('paid');
    }
  }, [outstandingEnabled, paymentType]);

  function handleCustomerSelect(customer: Customer | null) {
    setCustomerId(customer?.id ?? null);
    setSelectedCustomer(customer);
    if (customer) {
      setCustomerName(customer.name);
      setCustomerPhone(customer.mobile ?? '');
      if (customer.credit_days && !dueDate) {
        const due = new Date();
        due.setDate(due.getDate() + customer.credit_days);
        setDueDate(due.toISOString().slice(0, 10));
      }
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
    setPaymentType('paid');
    setAmountTendered(null);
    setPaidNow(null);
    setDueDate('');
    setCustomerId(null);
    setSelectedCustomer(null);
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
        amount_tendered: paymentType === 'paid' && paymentMethod === 'cash' ? amountTendered : null,
        payment_type: paymentType,
        paid_now: paymentType === 'partial' ? (paidNow ?? 0) : paymentType === 'credit' ? 0 : undefined,
        due_date: paymentType !== 'paid' ? dueDate || null : null,
      });
      setCompletedInvoice(invoice);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }

  const requiresCustomer = outstandingEnabled && paymentType !== 'paid';
  const canCheckout =
    cart.lines.length > 0 &&
    !createInvoice.isPending &&
    !completedInvoice &&
    !heldBillsOpen &&
    (paymentType !== 'paid' || paymentMethod !== 'cash' || (amountTendered !== null && amountTendered >= totals.total)) &&
    (!requiresCustomer || (!!customerId && !!dueDate));
  useKeyboardShortcuts({ onCheckout: handleCheckout, canCheckout });

  const heldBillsCount = heldBillsData?.total ?? 0;

  return (
    <div className="flex flex-col gap-3 md:h-full md:overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-xl font-semibold">Billing</h1>
        <Button variant="outline" className="gap-2" onClick={() => setHeldBillsOpen(true)}>
          <PackageOpen className="size-4" />
          Held Bills
          {heldBillsCount > 0 && <Badge variant="secondary">{heldBillsCount}</Badge>}
        </Button>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-3 md:flex-1 md:grid-cols-[2fr_5fr_2fr] md:overflow-hidden">
        <Card className="min-h-0 p-2">
          <ProductSearchPanel onAdd={cart.addProduct} />
        </Card>
        <Card className="min-h-0 p-2">
          <CartPanel
            lines={cart.lines}
            onQuantityChange={cart.setQuantity}
            onPriceChange={cart.setPrice}
            onRemove={cart.removeLine}
            onClear={cart.clear}
            canOverridePrice={canOverridePrice}
          />
        </Card>
        <Card className="min-h-0 p-3">
          <CheckoutPanel
            lines={cart.lines}
            discountType={discountType}
            discountValue={discountValue}
            onDiscountChange={handleDiscountChange}
            taxPercentage={taxPercentage}
            onTaxPercentageChange={setTaxPercentage}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            paymentType={paymentType}
            onPaymentTypeChange={setPaymentType}
            outstandingEnabled={outstandingEnabled}
            amountTendered={amountTendered}
            onAmountTenderedChange={setAmountTendered}
            paidNow={paidNow}
            onPaidNowChange={setPaidNow}
            dueDate={dueDate}
            onDueDateChange={setDueDate}
            customerName={customerName}
            onCustomerNameChange={setCustomerName}
            customerPhone={customerPhone}
            onCustomerPhoneChange={setCustomerPhone}
            onHold={() => holdMutation.mutate()}
            isHolding={holdMutation.isPending}
            allowDiscounts={preferences?.allow_discounts ?? true}
            enableCustomerSelection={preferences?.enable_customer_selection ?? false}
            customerId={customerId}
            selectedCustomer={selectedCustomer}
            onCustomerSelect={handleCustomerSelect}
            totals={totals}
            onCheckout={handleCheckout}
            isSubmitting={createInvoice.isPending}
            error={error}
          />
        </Card>
      </div>

      <InvoiceSuccessDialog
        invoice={completedInvoice}
        onClose={resetForNewSale}
        autoPrint={preferences?.auto_print_after_checkout ?? false}
        autoPrintPrinterName={preferences?.auto_print_printer_name ?? null}
        autoPrintPaperSize={preferences?.auto_print_paper_size ?? '80mm'}
      />
      <HeldBillsDialog open={heldBillsOpen} onClose={() => setHeldBillsOpen(false)} onResume={resumeHeldBill} />
    </div>
  );
}
