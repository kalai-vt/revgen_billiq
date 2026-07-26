import { request, requestBlob } from '@/lib/api-client';
import type { Product } from '@/features/products/api';

export type PaymentMethod = 'cash' | 'card' | 'upi';
export type DiscountType = 'flat' | 'percent' | null;
export type PaymentType = 'paid' | 'partial' | 'credit';
export type InvoicePaymentStatus = 'paid' | 'partially_paid' | 'credit' | 'cancelled';

export interface InvoiceItem {
  id: string;
  product_id: string;
  product_name: string;
  identifier_type: string | null;
  identifier_value: string;
  quantity: number;
  unit_price: number;
  tax_rate_percent: number;
  tax_amount: number;
  line_subtotal: number;
  line_total: number;
  returned_quantity: number;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  created_by: string;
  created_by_name: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  gst_number: string | null;
  status: 'paid' | 'pending' | 'partial' | 'cancelled' | 'refunded';
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  taxable_amount: number;
  tax_percentage: number;
  tax_amount: number;
  total_amount: number;
  payment_method: PaymentMethod;
  amount_tendered: number | null;
  change_due: number | null;
  payment_status: InvoicePaymentStatus;
  due_date: string | null;
  paid_amount: number;
  outstanding_amount: number;
  payment_terms: string | null;
  is_overdue: boolean;
  created_at: string;
  items: InvoiceItem[];
}

export interface InvoiceListResult {
  items: Invoice[];
  total: number;
  page: number;
  page_size: number;
}

export interface InvoiceCreatePayload {
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  lines: { product_id: string; quantity: number; unit_price?: number | null }[];
  discount_type?: DiscountType;
  discount_value?: number;
  tax_percentage?: number;
  payment_method: PaymentMethod;
  amount_tendered?: number | null;
  payment_type?: PaymentType;
  paid_now?: number;
  due_date?: string | null;
}

export interface InvoiceListParams {
  page: number;
  page_size?: number;
  q?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  sort_by?: 'created_at' | 'total_amount' | 'invoice_number';
  sort_dir?: 'asc' | 'desc';
}

export function listInvoices(params: InvoiceListParams): Promise<InvoiceListResult> {
  const search = new URLSearchParams();
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size ?? 20));
  if (params.q) search.set('q', params.q);
  if (params.date_from) search.set('date_from', params.date_from);
  if (params.date_to) search.set('date_to', params.date_to);
  if (params.status) search.set('status', params.status);
  if (params.sort_by) search.set('sort_by', params.sort_by);
  if (params.sort_dir) search.set('sort_dir', params.sort_dir);
  return request(`/api/invoices?${search.toString()}`);
}

export function getInvoice(id: string): Promise<Invoice> {
  return request(`/api/invoices/${id}`);
}

export function createInvoice(payload: InvoiceCreatePayload): Promise<Invoice> {
  return request('/api/invoices', { method: 'POST', body: JSON.stringify(payload) });
}

export function voidInvoice(id: string): Promise<Invoice> {
  return request(`/api/invoices/${id}/void`, { method: 'POST' });
}

export function downloadInvoicePdf(id: string): Promise<Blob> {
  return requestBlob(`/api/invoices/${id}/pdf`);
}

export function exportInvoices(
  format: 'excel' | 'pdf' | 'csv',
  params: Omit<InvoiceListParams, 'page' | 'page_size'>,
): Promise<Blob> {
  const search = new URLSearchParams();
  search.set('format', format);
  if (params.q) search.set('q', params.q);
  if (params.date_from) search.set('date_from', params.date_from);
  if (params.date_to) search.set('date_to', params.date_to);
  if (params.status) search.set('status', params.status);
  if (params.sort_by) search.set('sort_by', params.sort_by);
  if (params.sort_dir) search.set('sort_dir', params.sort_dir);
  return requestBlob(`/api/invoices/export?${search.toString()}`);
}

export type ReturnReason = 'damaged' | 'wrong_item' | 'expired' | 'changed_mind' | 'duplicate_purchase' | 'other';
export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  damaged: 'Damaged',
  wrong_item: 'Wrong Item',
  expired: 'Expired',
  changed_mind: 'Customer Changed Mind',
  duplicate_purchase: 'Duplicate Purchase',
  other: 'Other',
};
export const RETURN_REASONS: ReturnReason[] = ['damaged', 'wrong_item', 'expired', 'changed_mind', 'duplicate_purchase', 'other'];

export type ReturnCondition = 'sellable' | 'damaged' | 'expired' | 'opened';
export const RETURN_CONDITION_LABELS: Record<ReturnCondition, string> = {
  sellable: 'Sellable',
  damaged: 'Damaged',
  expired: 'Expired',
  opened: 'Opened',
};
export const RETURN_CONDITIONS: ReturnCondition[] = ['sellable', 'damaged', 'expired', 'opened'];

export type InventoryAction = 'return_to_stock' | 'mark_damaged' | 'discard';
export const INVENTORY_ACTION_LABELS: Record<InventoryAction, string> = {
  return_to_stock: 'Return to Stock',
  mark_damaged: 'Mark as Damaged',
  discard: 'Discard',
};
export const INVENTORY_ACTIONS: InventoryAction[] = ['return_to_stock', 'mark_damaged', 'discard'];

// Condition -> the inventory action it suggests by default (still independently editable).
export const CONDITION_DEFAULT_ACTION: Record<ReturnCondition, InventoryAction> = {
  sellable: 'return_to_stock',
  damaged: 'mark_damaged',
  expired: 'discard',
  opened: 'mark_damaged',
};

export type RefundMethod = 'cash' | 'card' | 'upi' | 'bank_transfer';
export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
};
export const REFUND_METHODS: RefundMethod[] = ['cash', 'card', 'upi', 'bank_transfer'];

export type ReturnStatus = 'fully_refunded' | 'partially_refunded' | 'cancelled';

export interface ReturnLine {
  invoice_item_id: string;
  quantity: number;
  reason: ReturnReason;
  condition: ReturnCondition;
  inventory_action: InventoryAction;
}

export interface ReturnItem {
  id: string;
  invoice_item_id: string;
  product_id: string;
  product_name: string;
  identifier_value: string;
  quantity_returned: number;
  unit_price: number;
  line_refund_amount: number;
  reason: ReturnReason;
  condition: ReturnCondition;
  inventory_action: InventoryAction;
  restocked: boolean;
}

export interface Return {
  id: string;
  tenant_id: string;
  invoice_id: string;
  invoice_number: string;
  return_number: string;
  status: ReturnStatus;
  subtotal_amount: number;
  discount_adjustment: number;
  tax_adjustment: number;
  round_off: number;
  refund_amount: number;
  refund_method: RefundMethod;
  created_by: string;
  created_by_name: string;
  created_at: string;
  cancelled_by: string | null;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  cashier_name: string;
  payment_method: string;
  items: ReturnItem[];
}

export interface ReturnListResult {
  items: Return[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReturnListParams {
  page: number;
  page_size?: number;
  q?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  refund_method?: string;
  created_by?: string;
  sort_by?: 'created_at' | 'refund_amount' | 'return_number';
  sort_dir?: 'asc' | 'desc';
}

export interface ReturnsDashboard {
  today_return_count: number;
  today_refund_amount: number;
  month_return_count: number;
  today_returned_product_qty: number;
}

export function createReturn(invoiceId: string, lines: ReturnLine[], refundMethod?: RefundMethod): Promise<Return> {
  return request(`/api/invoices/${invoiceId}/returns`, {
    method: 'POST',
    body: JSON.stringify({ lines, refund_method: refundMethod ?? null }),
  });
}

function returnListSearch(params: ReturnListParams): URLSearchParams {
  const search = new URLSearchParams();
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size ?? 20));
  if (params.q) search.set('q', params.q);
  if (params.date_from) search.set('date_from', params.date_from);
  if (params.date_to) search.set('date_to', params.date_to);
  if (params.status) search.set('status', params.status);
  if (params.refund_method) search.set('refund_method', params.refund_method);
  if (params.created_by) search.set('created_by', params.created_by);
  if (params.sort_by) search.set('sort_by', params.sort_by);
  if (params.sort_dir) search.set('sort_dir', params.sort_dir);
  return search;
}

export function listReturns(params: ReturnListParams): Promise<ReturnListResult> {
  return request(`/api/returns?${returnListSearch(params).toString()}`);
}

export function getReturn(id: string): Promise<Return> {
  return request(`/api/returns/${id}`);
}

export function cancelReturn(id: string, reason: string): Promise<Return> {
  return request(`/api/returns/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function downloadReturnPdf(id: string): Promise<Blob> {
  return requestBlob(`/api/returns/${id}/pdf`);
}

export function exportReturns(
  format: 'excel' | 'pdf' | 'csv',
  params: Omit<ReturnListParams, 'page' | 'page_size'>,
): Promise<Blob> {
  const search = returnListSearch({ ...params, page: 1 });
  search.delete('page');
  search.delete('page_size');
  search.set('format', format);
  return requestBlob(`/api/returns/export?${search.toString()}`);
}

export function getReturnsDashboard(): Promise<ReturnsDashboard> {
  return request('/api/returns/dashboard');
}

export interface HeldBillLineCreate {
  product_id: string;
  quantity: number;
  unit_price?: number | null;
}

export interface HeldBillCreatePayload {
  customer_name?: string | null;
  customer_phone?: string | null;
  lines: HeldBillLineCreate[];
  discount_type?: DiscountType;
  discount_value?: number;
  tax_percentage?: number;
  payment_method?: PaymentMethod;
  notes?: string | null;
}

export interface HeldBillLine {
  product: Product;
  quantity: number;
  unit_price: number | null;
}

export interface HeldBill {
  id: string;
  tenant_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  discount_type: DiscountType;
  discount_value: number;
  tax_percentage: number;
  payment_method: PaymentMethod;
  notes: string | null;
  lines: HeldBillLine[];
  created_by: string;
  created_by_name: string;
  created_at: string;
}

export function holdBill(payload: HeldBillCreatePayload): Promise<HeldBill> {
  return request('/api/pos/held-bills', { method: 'POST', body: JSON.stringify(payload) });
}

export function listHeldBills(): Promise<{ items: HeldBill[]; total: number }> {
  return request('/api/pos/held-bills');
}

export function deleteHeldBill(id: string): Promise<void> {
  return request(`/api/pos/held-bills/${id}`, { method: 'DELETE' });
}
