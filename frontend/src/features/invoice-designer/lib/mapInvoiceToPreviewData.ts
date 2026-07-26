import type { ItemColumnKey, PreviewData } from '@/features/invoice-designer/api';
import type { Invoice, Return } from '@/features/pos/api';
import type { DateFormat } from '@/features/settings/api';

const NOT_TRACKED = '—';

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

function invoiceItemValues(item: Invoice['items'][number], decimalPrecision: number): Partial<Record<ItemColumnKey, string>> {
  return {
    product: item.product_name,
    sku: item.identifier_value,
    barcode: item.identifier_value,
    hsn_sac: NOT_TRACKED,
    batch: NOT_TRACKED,
    expiry: NOT_TRACKED,
    serial: NOT_TRACKED,
    description: item.product_name,
    qty: String(item.quantity),
    unit: 'pc',
    mrp: NOT_TRACKED,
    selling_price: item.unit_price.toFixed(decimalPrecision),
    discount: NOT_TRACKED,
    tax: item.tax_amount.toFixed(decimalPrecision),
    amount: item.line_total.toFixed(decimalPrecision),
  };
}

export function invoiceToPreviewData(invoice: Invoice, dateFormat: DateFormat, decimalPrecision: number): PreviewData {
  return {
    documentLabel: 'Tax Invoice',
    number: invoice.invoice_number,
    date: formatDate(invoice.created_at, dateFormat),
    time: formatTime(invoice.created_at),
    dueDate: invoice.due_date ? formatDate(invoice.due_date, dateFormat) : null,
    cashier: invoice.created_by_name,
    customerId: invoice.customer_id,
    paymentMethod: invoice.payment_method.toUpperCase(),
    paymentStatus: invoice.payment_status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    invoiceStatus: invoice.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    customer: {
      name: invoice.customer_name,
      mobile: invoice.customer_phone,
      gstin: invoice.gst_number,
    },
    items: invoice.items.map((item) => ({ values: invoiceItemValues(item, decimalPrecision) })),
    totals: {
      subtotal: invoice.subtotal,
      discount: invoice.discount_amount,
      cgst: invoice.tax_amount / 2,
      sgst: invoice.tax_amount / 2,
      igst: invoice.tax_amount,
      cess: 0,
      round_off: 0,
      shipping: 0,
      packing: 0,
      grand_total: invoice.total_amount,
      paid: invoice.paid_amount,
      outstanding: invoice.outstanding_amount,
      balance: invoice.outstanding_amount,
    },
  };
}

function returnItemValues(item: Return['items'][number], decimalPrecision: number): Partial<Record<ItemColumnKey, string>> {
  return {
    product: item.product_name,
    sku: item.identifier_value,
    barcode: item.identifier_value,
    hsn_sac: NOT_TRACKED,
    batch: NOT_TRACKED,
    expiry: NOT_TRACKED,
    serial: NOT_TRACKED,
    description: item.product_name,
    qty: String(item.quantity_returned),
    unit: 'pc',
    mrp: NOT_TRACKED,
    selling_price: item.unit_price.toFixed(decimalPrecision),
    discount: item.reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    tax: NOT_TRACKED,
    amount: item.line_refund_amount.toFixed(decimalPrecision),
  };
}

export function returnToPreviewData(ret: Return, dateFormat: DateFormat, decimalPrecision: number): PreviewData {
  return {
    documentLabel: `Return Receipt (Against Invoice ${ret.invoice_number})`,
    number: ret.return_number,
    date: formatDate(ret.created_at, dateFormat),
    time: formatTime(ret.created_at),
    cashier: ret.cashier_name ?? ret.created_by_name,
    paymentMethod: ret.refund_method.toUpperCase(),
    invoiceStatus: ret.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    customer: {
      name: ret.customer_name,
      mobile: ret.customer_phone,
    },
    items: ret.items.map((item) => ({ values: returnItemValues(item, decimalPrecision) })),
    totals: {
      subtotal: ret.subtotal_amount,
      discount: ret.discount_adjustment,
      cgst: ret.tax_adjustment / 2,
      sgst: ret.tax_adjustment / 2,
      igst: ret.tax_adjustment,
      cess: 0,
      round_off: ret.round_off,
      shipping: 0,
      packing: 0,
      grand_total: ret.refund_amount,
      paid: ret.refund_amount,
      outstanding: 0,
      balance: 0,
    },
  };
}
