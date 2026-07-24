import { request, requestBlob } from '@/lib/api-client';
import type { Product } from '@/features/products/api';

export type PaymentMethod = 'cash' | 'card' | 'upi';
export type DiscountType = 'flat' | 'percent' | null;

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

export interface ReturnLine {
  invoice_item_id: string;
  quantity: number;
}

export interface ReturnItem {
  id: string;
  invoice_item_id: string;
  product_id: string;
  product_name: string;
  quantity_returned: number;
  unit_price: number;
  line_refund_amount: number;
}

export interface Return {
  id: string;
  tenant_id: string;
  invoice_id: string;
  invoice_number: string;
  return_number: string;
  reason: string | null;
  refund_amount: number;
  refund_method: string | null;
  created_by: string;
  created_at: string;
  items: ReturnItem[];
}

export interface ReturnListResult {
  items: Return[];
  total: number;
  page: number;
  page_size: number;
}

export function createReturn(invoiceId: string, lines: ReturnLine[], reason?: string): Promise<Return> {
  return request(`/api/invoices/${invoiceId}/returns`, {
    method: 'POST',
    body: JSON.stringify({ lines, reason: reason ?? null }),
  });
}

export function listReturns(page: number, pageSize = 20): Promise<ReturnListResult> {
  return request(`/api/returns?page=${page}&page_size=${pageSize}`);
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
