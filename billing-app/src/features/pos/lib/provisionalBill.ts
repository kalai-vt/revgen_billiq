import type { ItemColumnKey, PreviewData } from '@/features/invoice-designer/api';
import type { CartLine } from '@/features/pos/hooks/useCart';
import type { CartTotals } from '@/features/pos/lib/calc';
import { effectivePrice } from '@/features/pos/lib/pricing';
import type { DiscountType, PaymentMethod, PaymentType } from '@/features/pos/api';
import type { DateFormat } from '@/features/settings/api';

const STORAGE_KEY = 'billiq_provisional_bill_draft';

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  paid: 'Paid in Full',
  partial: 'Partially Paid',
  credit: 'Credit (Pay Later)',
};

/** A plain-data snapshot of the current cart at the moment "Print Order Bill" is clicked — never
 * an Invoice, never persisted server-side. Handed to the print tab via localStorage (same-origin,
 * so a window.open()'d tab can read it immediately) rather than a URL param, since a cart's JSON
 * can comfortably exceed safe URL length limits. */
export interface ProvisionalBillSnapshot {
  reference: string;
  createdAtIso: string;
  lines: {
    productName: string;
    identifierValue: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  customerName: string | null;
  customerPhone: string | null;
  discountType: DiscountType;
  discountValue: number;
  taxPercentage: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
}

/** ORD-prefixed, base36 timestamp — deliberately never in the INV-###### format real invoice
 * numbers use, so a printed order bill can never be mistaken for (or cross-referenced as) a real
 * invoice number. */
export function generateOrderReference(): string {
  return `ORD-${Date.now().toString(36).toUpperCase()}`;
}

export function buildProvisionalBillSnapshot(args: {
  lines: CartLine[];
  totals: CartTotals;
  customerName: string;
  customerPhone: string;
  discountType: DiscountType;
  discountValue: number;
  taxPercentage: number;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
}): ProvisionalBillSnapshot {
  return {
    reference: generateOrderReference(),
    createdAtIso: new Date().toISOString(),
    lines: args.lines.map((line) => ({
      productName: line.product.name,
      identifierValue: line.product.identifier_value,
      quantity: line.quantity,
      unitPrice: effectivePrice(line),
      lineTotal: effectivePrice(line) * line.quantity,
    })),
    customerName: args.customerName || null,
    customerPhone: args.customerPhone || null,
    discountType: args.discountType,
    discountValue: args.discountValue,
    taxPercentage: args.taxPercentage,
    subtotal: args.totals.subtotal,
    discountAmount: args.totals.discountAmount,
    taxAmount: args.totals.taxAmount,
    total: args.totals.total,
    paymentType: args.paymentType,
    paymentMethod: args.paymentMethod,
  };
}

export function storeProvisionalBillSnapshot(snapshot: ProvisionalBillSnapshot): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

/** Read-and-clear — a stale draft must never resurface for a later print, since it wouldn't
 * reflect the cart at all anymore. */
export function consumeProvisionalBillSnapshot(): ProvisionalBillSnapshot | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  localStorage.removeItem(STORAGE_KEY);
  try {
    return JSON.parse(raw) as ProvisionalBillSnapshot;
  } catch {
    return null;
  }
}

function formatDate(iso: string, dateFormat: DateFormat): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  if (dateFormat === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
  if (dateFormat === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
  return `${dd}/${mm}/${yyyy}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function lineValues(
  line: ProvisionalBillSnapshot['lines'][number],
  decimalPrecision: number,
): Partial<Record<ItemColumnKey, string>> {
  return {
    product: line.productName,
    sku: line.identifierValue,
    barcode: line.identifierValue,
    description: line.productName,
    qty: String(line.quantity),
    unit: 'pc',
    selling_price: line.unitPrice.toFixed(decimalPrecision),
    amount: line.lineTotal.toFixed(decimalPrecision),
  };
}

/** Same TemplatePreview renderer real invoices use (same tax_invoice template, same branding),
 * so a Provisional Bill and the eventual Final Invoice for the same sale show identical business
 * info, line items, and totals — the only differences are the document label and reference
 * number. Uses `documentLabel` (the same field that normally reads "Tax Invoice") to carry the
 * mandatory "not a final invoice" marking. */
export function provisionalBillToPreviewData(
  snapshot: ProvisionalBillSnapshot,
  dateFormat: DateFormat,
  decimalPrecision: number,
): PreviewData {
  return {
    documentLabel: 'PROVISIONAL BILL — NOT A FINAL INVOICE',
    number: snapshot.reference,
    date: formatDate(snapshot.createdAtIso, dateFormat),
    time: formatTime(snapshot.createdAtIso),
    paymentMethod: snapshot.paymentMethod.toUpperCase(),
    // Nothing has actually been collected yet at print time — this reflects intent (what's
    // currently selected in the checkout panel), not a recorded transaction.
    paymentStatus: `${PAYMENT_TYPE_LABELS[snapshot.paymentType]} — Pending`,
    customer: {
      name: snapshot.customerName,
      mobile: snapshot.customerPhone,
    },
    items: snapshot.lines.map((line) => ({ values: lineValues(line, decimalPrecision) })),
    totals: {
      subtotal: snapshot.subtotal,
      discount: snapshot.discountAmount,
      cgst: snapshot.taxAmount / 2,
      sgst: snapshot.taxAmount / 2,
      igst: snapshot.taxAmount,
      cess: 0,
      round_off: 0,
      shipping: 0,
      packing: 0,
      grand_total: snapshot.total,
      paid: 0,
      outstanding: snapshot.total,
      balance: snapshot.total,
    },
  };
}
