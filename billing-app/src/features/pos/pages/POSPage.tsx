import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
import { PageHeaderAction } from '@/components/layout/pageActions';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useOrderCart } from '@/features/pos/hooks/useOrderCart';
import { useCreateInvoice } from '@/features/pos/hooks/useCreateInvoice';
import { useKeyboardShortcuts } from '@/features/pos/hooks/useKeyboardShortcuts';
import { computeTotals } from '@/features/pos/lib/calc';
import { useCheckoutConfig } from '@/features/pos/lib/checkoutElements';
import { computeCheckoutGridColumns, getVisiblePaymentMethods, getVisiblePaymentTypes } from '@/features/pos/lib/checkoutLayout';
import { buildProvisionalBillSnapshot, storeProvisionalBillSnapshot } from '@/features/pos/lib/provisionalBill';
import { printProvisionalBillSilently, silentPrintFailureMessage, type SilentPrintResult } from '@/features/pos/lib/silentPrint';
import * as posApi from '@/features/pos/api';
import * as settingsApi from '@/features/settings/api';
import { useFeatureFlag } from '@/features/settings/hooks/useFeatureFlags';
import type { Customer } from '@/features/customers/api';
import type { DiscountType, HeldBill, Invoice, PaymentMethod, PaymentType } from '@/features/pos/api';
import * as restaurantApi from '@/features/restaurant/api';
import { kotPrintFailureMessage, printKot as printKotTicket } from '@/features/restaurant/lib/kotPrint';
import { NO_TABLE } from '@/features/pos/components/TableSelector';
import { ChangeTableDialog } from '@/features/pos/components/ChangeTableDialog';
import { ApiError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/query-error';
import { appPath } from '@/lib/app-path';

export function POSPage() {
  const [tableId, setTableId] = useState<string>(NO_TABLE);
  const [pendingTableChange, setPendingTableChange] = useState<string | null>(null);
  const cart = useOrderCart(tableId);
  const { canOverridePrice } = useAuth();
  const outstandingEnabled = useFeatureFlag('payments_credit');
  const checkoutConfig = useCheckoutConfig();
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
  // null = auto (each line taxed at its own product's tax_rate_percent, see computeTotals) — the
  // default. Set once the cashier types into the Tax % field, overriding every line to that rate.
  const [taxOverride, setTaxOverride] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentType, setPaymentType] = useState<PaymentType>('paid');
  const [amountTendered, setAmountTendered] = useState<number | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [paidNow, setPaidNow] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
  const [heldBillsOpen, setHeldBillsOpen] = useState(false);
  // Set on resume, cleared once that resumed bill's checkout actually succeeds (or a fresh
  // sale starts) — the held bill itself is only deleted server-side at that point, not at
  // resume time, so a crash/refresh/failed checkout in between leaves it recoverable. See
  // resumeHeldBill/handleCheckout.
  const [resumedHeldBillId, setResumedHeldBillId] = useState<string | null>(null);
  // One id per checkout attempt, sent as InvoiceCreate.idempotency_key so a retried/duplicated
  // request can't create two invoices — see useCreateInvoice/handleCheckout. Regenerated only
  // once an attempt actually succeeds or the cart is cleared, never on every render/retry.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const createInvoice = useCreateInvoice();

  /** Fires the cart at the kitchen without billing it — the dine-in "order now, pay later" step.
   * Creates (or appends to) the table's open order and sends a KOT for whatever isn't yet sent,
   * so the cart on screen and the tab on the table stay one and the same order. */
  const printKot = useMutation({
    mutationFn: async () => {
      // The cart is already this table's order — firing a KOT never creates another one.
      const order = cart.order ?? (await restaurantApi.openTableOrder(tableId, []));
      const kot = await restaurantApi.createKot(order.id, {});
      return { order, kot, print: await printKotTicket(kot, order, false) };
    },
    onSuccess: ({ kot, print }) => {
      toast.success(`${kot.kot_number} sent to the kitchen`);
      if (!print.ok) toast.warning(kotPrintFailureMessage(print));
      queryClient.invalidateQueries({ queryKey: ['restaurant'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not send this to the kitchen'),
  });
  const queryClient = useQueryClient();
  const totals = computeTotals(cart.lines, discountType, discountValue, taxOverride);

  // Seed defaults from business preferences once, on first load — a fresh cart with no
  // interaction yet. Tax itself isn't seeded here: it now defaults to each product's own
  // tax_rate_percent (see computeTotals), not the tenant's default_tax_percent setting.
  useEffect(() => {
    if (preferences && cart.lines.length === 0 && discountType === null) {
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

  // If the tenant's Checkout Elements settings hide the currently-selected payment type/method
  // (or the Outstanding module gets disabled out from under a mid-selection), fall back to the
  // first one still visible — hiding a UI option must never leave the sale in an unselectable
  // state. Business logic itself (what create_invoice accepts) is unaffected either way.
  useEffect(() => {
    const visibleTypes = getVisiblePaymentTypes(checkoutConfig, outstandingEnabled);
    if (visibleTypes.length > 0 && !visibleTypes.includes(paymentType)) {
      setPaymentType(visibleTypes[0]);
    }
  }, [checkoutConfig, outstandingEnabled, paymentType]);

  useEffect(() => {
    const visibleMethods = getVisiblePaymentMethods(checkoutConfig);
    if (visibleMethods.length > 0 && !visibleMethods.includes(paymentMethod)) {
      setPaymentMethod(visibleMethods[0]);
    }
  }, [checkoutConfig, paymentMethod]);

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
        tax_percentage: taxOverride,
        payment_method: paymentMethod,
      }),
    onSuccess: () => {
      toast.success('Bill held');
      queryClient.invalidateQueries({ queryKey: ['held-bills'] });
      resetForNewSale();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  /** Switching tables with a cart in hand is ambiguous — the items might belong to the guests who
   * just moved, or to the table they came from. Silently carrying them either way loses somebody's
   * order, so the choice goes to the cashier.
   *
   * Moving keeps the same order (and its number and kitchen tickets) and only reassigns the
   * table, which is the existing transfer path — not a copy into a new order. */
  function handleTableChange(nextTableId: string) {
    const leavingATabBehind = cart.isTableMode && cart.lines.length > 0 && nextTableId !== tableId;
    if (leavingATabBehind) {
      setPendingTableChange(nextTableId);
      return;
    }
    setTableId(nextTableId);
  }

  const moveOrderToTable = useMutation({
    mutationFn: (toTableId: string) => restaurantApi.transferOrder(cart.order!.id, toTableId),
    onSuccess: (updated) => {
      toast.success(`Order moved to Table ${updated.table_name}`);
      setTableId(updated.table_id ?? NO_TABLE);
      setPendingTableChange(null);
      queryClient.invalidateQueries({ queryKey: ['restaurant'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not move that order')),
  });

  function resumeHeldBill(heldBill: HeldBill) {
    // A held bill is a counter sale with no table behind it, so resuming one leaves table mode
    // rather than trying to graft a local cart onto somebody's tab.
    setTableId(NO_TABLE);
    cart.setLines(
      heldBill.lines.map((line) => ({
        product: line.product,
        quantity: line.quantity,
        overridePrice: line.unit_price,
      })),
    );
    setDiscountType(heldBill.discount_type);
    setDiscountValue(heldBill.discount_value);
    // The held bill stored a concrete snapshot (the effective rate at hold-time, whether that
    // came from auto or a manual override) — treat it as a fixed override on resume, the same
    // way discount_value is resumed as-is rather than recomputed.
    setTaxOverride(heldBill.tax_percentage);
    setPaymentMethod(heldBill.payment_method);
    setCustomerName(heldBill.customer_name ?? '');
    setCustomerPhone(heldBill.customer_phone ?? '');
    setHeldBillsOpen(false);
    // Deliberately NOT deleted here — only once this resumed bill's checkout actually
    // succeeds (see handleCheckout). A browser crash/refresh, or a checkout that fails,
    // between resume and checkout must leave the held bill recoverable, not silently gone.
    setResumedHeldBillId(heldBill.id);
  }

  function handleDiscountChange(type: DiscountType, value: number) {
    setDiscountType(type);
    setDiscountValue(value);
  }

  // Provisional/Order Bill: a print preview of the current cart for the customer to review and
  // pay against before Checkout. Deliberately makes no API call at all — no invoice, payment, or
  // inventory change happens here; only a real Checkout does that. Tries the configured silent
  // print transport first (Settings > Automatic Printing), same as a real invoice would use —
  // only opens the print-preview tab (via the snapshot handed off through localStorage, see
  // provisionalBill.ts) as a fallback when nothing's configured, printing fails, or the default
  // paper size isn't thermal (there's no saved invoice yet to render a PDF from).
  async function handlePrintOrderBill() {
    const snapshot = buildProvisionalBillSnapshot({
      lines: cart.lines,
      totals,
      customerName,
      customerPhone,
      discountType,
      discountValue,
      taxPercentage: taxOverride ?? totals.effectiveTaxPercentage,
      paymentType,
      paymentMethod,
    });
    const printed = await printProvisionalBillSilently(snapshot).catch(
      (err): SilentPrintResult => ({
        ok: false,
        reason: 'transport-failed',
        detail: err instanceof Error ? err.message : undefined,
      }),
    );
    if (printed.ok) {
      toast.success('Order bill sent to printer');
      return;
    }
    // Say why before the print-preview tab opens — an unexplained system print dialog is how a
    // misconfigured till looks identical to a working one.
    const reason = silentPrintFailureMessage(printed);
    if (reason) toast.warning(reason);
    storeProvisionalBillSnapshot(snapshot);
    window.open(appPath('/pos/provisional-bill/print'), '_blank', 'noopener,noreferrer');
  }

  function resetForNewSale() {
    cart.clear();
    setDiscountType(null);
    setDiscountValue(0);
    setTaxOverride(null);
    setPaymentMethod(preferences?.default_payment_method ?? 'cash');
    setPaymentType('paid');
    setAmountTendered(null);
    setPaymentReference('');
    setTableId(NO_TABLE);
    setPaidNow(null);
    setDueDate('');
    setCustomerId(null);
    setSelectedCustomer(null);
    setCustomerName('');
    setCustomerPhone('');
    setError(null);
    setCompletedInvoice(null);
    setResumedHeldBillId(null);
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  async function handleCheckout() {
    setError(null);
    try {
      // A table turns this into a dine-in sale: it has to go through the restaurant path so a
      // real order exists, the table's status is synced, and table-wise reporting sees it. The
      // resulting Invoice is identical either way — bill_order reuses the same sales service.
      if (cart.order) {
        // The cart *is* this table's order, so checkout bills that order rather than creating a
        // second one — the same call the Tables screen makes, so both routes share one checkout
        // path and one invoice.
        const billed = await restaurantApi.billOrder(cart.order.id, {
          payment_method: paymentMethod,
          payment_reference:
            paymentMethod !== 'cash' && paymentType !== 'credit' ? paymentReference.trim() || null : null,
          discount_type: discountType,
          discount_value: discountValue,
          tax_percentage: taxOverride,
          mark_paid: paymentType === 'paid',
          client_reference_id: idempotencyKeyRef.current,
        });
        const full = await posApi.getInvoice(billed.invoice_id);
        setCompletedInvoice(full);
        queryClient.invalidateQueries({ queryKey: ['restaurant'] });
        return;
      }

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
        tax_percentage: taxOverride,
        payment_method: paymentMethod,
        // Cash has no transaction id, and a credit sale hasn't been paid yet — don't carry over a
        // reference typed before the cashier switched method or payment type.
        payment_reference:
          paymentMethod !== 'cash' && paymentType !== 'credit' ? paymentReference.trim() || null : null,
        amount_tendered: paymentType === 'paid' && paymentMethod === 'cash' ? amountTendered : null,
        payment_type: paymentType,
        paid_now: paymentType === 'partial' ? (paidNow ?? 0) : paymentType === 'credit' ? 0 : undefined,
        due_date: paymentType !== 'paid' ? dueDate || null : null,
        idempotency_key: idempotencyKeyRef.current,
      });
      setCompletedInvoice(invoice);
      // Only now — checkout actually succeeded — is it safe to delete the held bill this sale
      // resumed from. Fire-and-forget: even if this specific call fails, the sale itself is
      // already done, and an orphaned held bill is a harmless cleanup nit, not a data-loss risk.
      if (resumedHeldBillId) {
        posApi.deleteHeldBill(resumedHeldBillId).then(() => queryClient.invalidateQueries({ queryKey: ['held-bills'] }));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }

  const requiresCustomer = outstandingEnabled && paymentType !== 'paid';
  // Amount tendered is a cashier balance/change aid only — never a requirement to check out (see
  // CheckoutPanel.tsx's own canCheckout, which this mirrors for the keyboard shortcut).
  const canCheckout =
    cart.lines.length > 0 &&
    !createInvoice.isPending &&
    !completedInvoice &&
    !heldBillsOpen &&
    (!requiresCustomer || (!!customerId && !!dueDate));
  useKeyboardShortcuts({ onCheckout: handleCheckout, canCheckout });

  const heldBillsCount = heldBillsData?.total ?? 0;
  // Checkout's column narrows (and Cart's widens to absorb the difference) with how many
  // optional element groups are actually showing — see checkoutLayout.ts. Set as a CSS custom
  // property rather than the class itself so the grid-cols-1 mobile layout is untouched; only the
  // md: breakpoint's grid-template-columns reads it.
  const checkoutGridColumns = computeCheckoutGridColumns(checkoutConfig, outstandingEnabled);

  return (
    <div className="flex flex-col gap-3 md:h-full md:overflow-hidden">
      <PageHeaderAction>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHeldBillsOpen(true)}>
          <PackageOpen className="size-4" />
          Held Bills
          {heldBillsCount > 0 && <Badge variant="secondary">{heldBillsCount}</Badge>}
        </Button>
      </PageHeaderAction>

      <div
        className="grid min-h-0 grid-cols-1 gap-3 md:flex-1 md:grid-cols-[var(--checkout-grid-cols)] md:overflow-hidden"
        style={{ '--checkout-grid-cols': checkoutGridColumns } as CSSProperties}
      >
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
            taxPercentage={totals.effectiveTaxPercentage}
            onTaxPercentageChange={setTaxOverride}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            paymentType={paymentType}
            onPaymentTypeChange={setPaymentType}
            outstandingEnabled={outstandingEnabled}
            paymentReference={paymentReference}
            onPaymentReferenceChange={setPaymentReference}
            tableId={tableId}
            onTableIdChange={handleTableChange}
            isTableMode={cart.isTableMode}
            onPrintKot={() => printKot.mutate()}
            isPrintingKot={printKot.isPending}
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
            onPrintOrderBill={handlePrintOrderBill}
            allowDiscounts={preferences?.allow_discounts ?? true}
            enableCustomerSelection={preferences?.enable_customer_selection ?? false}
            customerId={customerId}
            selectedCustomer={selectedCustomer}
            onCustomerSelect={handleCustomerSelect}
            totals={totals}
            onCheckout={handleCheckout}
            isSubmitting={createInvoice.isPending}
            error={error}
            checkoutConfig={checkoutConfig}
          />
        </Card>
      </div>

      <InvoiceSuccessDialog
        invoice={completedInvoice}
        onClose={resetForNewSale}
        autoPrint={preferences?.auto_print_after_checkout ?? false}
        autoPrintPrinterName={preferences?.auto_print_printer_name ?? null}
        autoPrintPaperSize={preferences?.auto_print_paper_size ?? '80mm'}
        autoPrintDeviceMode={preferences?.auto_print_device_mode ?? null}
      />
      <HeldBillsDialog open={heldBillsOpen} onClose={() => setHeldBillsOpen(false)} onResume={resumeHeldBill} />
      <ChangeTableDialog
        open={pendingTableChange !== null}
        itemCount={cart.lines.length}
        isPending={moveOrderToTable.isPending}
        onOpenChange={(next) => !next && setPendingTableChange(null)}
        onKeepCurrent={() => setPendingTableChange(null)}
        onMove={() => moveOrderToTable.mutate(pendingTableChange!)}
      />
    </div>
  );
}
