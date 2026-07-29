import { request, requestBlob } from '@/lib/api-client';

export interface Vendor {
  id: string;
  tenant_id: string;
  name: string;
  company_name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  gst_number: string | null;
  address: string | null;
  payment_terms_days: number | null;
  credit_limit: number;
  outstanding_amount: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type VendorSortField = 'name' | 'outstanding_amount' | 'created_at';

export interface VendorListParams {
  q?: string;
  is_active?: boolean;
  page: number;
  page_size: number;
  sort_by?: VendorSortField;
  sort_dir?: 'asc' | 'desc';
}

export interface VendorListResult {
  items: Vendor[];
  total: number;
  page: number;
  page_size: number;
}

export interface VendorPayload {
  name: string;
  company_name?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  gst_number?: string | null;
  address?: string | null;
  payment_terms_days?: number | null;
  credit_limit?: number;
  notes?: string | null;
  is_active?: boolean;
}

function vendorListSearch(params: VendorListParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.is_active !== undefined) search.set('is_active', String(params.is_active));
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size));
  if (params.sort_by) search.set('sort_by', params.sort_by);
  if (params.sort_dir) search.set('sort_dir', params.sort_dir);
  return search;
}

export function listVendors(params: VendorListParams): Promise<VendorListResult> {
  return request(`/api/procurement/vendors?${vendorListSearch(params).toString()}`);
}

export function listVendorsForPicker(): Promise<Vendor[]> {
  return request('/api/procurement/vendors/picker');
}

export function getVendor(id: string): Promise<Vendor> {
  return request(`/api/procurement/vendors/${id}`);
}

export function createVendor(payload: VendorPayload): Promise<Vendor> {
  return request('/api/procurement/vendors', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateVendor(id: string, payload: Partial<VendorPayload>): Promise<Vendor> {
  return request(`/api/procurement/vendors/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteVendor(id: string): Promise<void> {
  return request(`/api/procurement/vendors/${id}`, { method: 'DELETE' });
}

// --- Purchase entries ---

export type PurchaseEntryStatus = 'draft' | 'received' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface PurchaseEntryItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit: string | null;
  unit_cost_price: number;
  tax_rate_percent: number;
  tax_amount: number;
  discount_amount: number;
  line_subtotal: number;
  line_total: number;
  returned_quantity: number;
}

export interface PurchaseEntryItemPayload {
  product_id: string;
  quantity: number;
  unit?: string | null;
  unit_cost_price: number;
  tax_rate_percent?: number;
  discount_amount?: number;
}

export interface PurchaseEntry {
  id: string;
  tenant_id: string;
  vendor_id: string;
  vendor_name: string;
  purchase_number: string;
  vendor_invoice_number: string | null;
  purchase_date: string;
  status: PurchaseEntryStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_mode: string | null;
  payment_status: PaymentStatus;
  paid_amount: number;
  outstanding_amount: number;
  due_date: string | null;
  remarks: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  items: PurchaseEntryItem[];
}

export interface PurchaseEntryListItem {
  id: string;
  vendor_id: string;
  vendor_name: string;
  purchase_number: string;
  vendor_invoice_number: string | null;
  purchase_date: string;
  status: PurchaseEntryStatus;
  total_amount: number;
  payment_status: PaymentStatus;
  outstanding_amount: number;
  created_at: string;
}

export interface PurchaseEntryListResult {
  items: PurchaseEntryListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface PurchaseEntryCreatePayload {
  vendor_id: string;
  vendor_invoice_number?: string | null;
  purchase_date: string;
  items: PurchaseEntryItemPayload[];
  payment_mode?: string | null;
  due_date?: string | null;
  remarks?: string | null;
  status?: 'draft' | 'received';
}

export type PurchaseSortField = 'purchase_date' | 'total_amount' | 'created_at';

export interface PurchaseEntryListParams {
  q?: string;
  vendor_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
  sort_by?: PurchaseSortField;
  sort_dir?: 'asc' | 'desc';
}

function purchaseListSearch(params: PurchaseEntryListParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.vendor_id) search.set('vendor_id', params.vendor_id);
  if (params.status) search.set('status', params.status);
  if (params.date_from) search.set('date_from', params.date_from);
  if (params.date_to) search.set('date_to', params.date_to);
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size));
  if (params.sort_by) search.set('sort_by', params.sort_by);
  if (params.sort_dir) search.set('sort_dir', params.sort_dir);
  return search;
}

export function listPurchases(params: PurchaseEntryListParams): Promise<PurchaseEntryListResult> {
  return request(`/api/procurement/purchases?${purchaseListSearch(params).toString()}`);
}

export function getPurchase(id: string): Promise<PurchaseEntry> {
  return request(`/api/procurement/purchases/${id}`);
}

export function createPurchase(payload: PurchaseEntryCreatePayload): Promise<PurchaseEntry> {
  return request('/api/procurement/purchases', { method: 'POST', body: JSON.stringify(payload) });
}

export function confirmPurchase(id: string): Promise<PurchaseEntry> {
  return request(`/api/procurement/purchases/${id}/confirm`, { method: 'POST' });
}

export function cancelPurchase(id: string, reason?: string | null): Promise<PurchaseEntry> {
  return request(`/api/procurement/purchases/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: reason ?? null }) });
}

// --- Dashboard ---

export interface ProcurementDashboardKpis {
  today_purchase_value: number;
  month_purchase_value: number;
  range_purchase_value: number;
  range_purchase_count: number;
  active_vendors_count: number;
  outstanding_vendor_payments: number;
}

export interface TopVendor {
  vendor_id: string;
  vendor_name: string;
  total_amount: number;
  purchase_count: number;
}

export interface ProcurementDashboard {
  kpis: ProcurementDashboardKpis;
  top_vendors: TopVendor[];
}

export function getProcurementDashboard(dateFrom: string, dateTo: string): Promise<ProcurementDashboard> {
  const search = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  return request(`/api/procurement/dashboard?${search.toString()}`);
}

// --- Purchase returns ---

export type ReturnReason = 'damaged' | 'expired' | 'wrong_item' | 'quality_issue' | 'other';
export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  damaged: 'Damaged',
  expired: 'Expired',
  wrong_item: 'Wrong Item',
  quality_issue: 'Quality Issue',
  other: 'Other',
};
export type RefundMethod = 'credit_note' | 'cash' | 'bank_transfer';
export type PurchaseReturnStatus = 'completed' | 'cancelled';

export interface PurchaseReturnLinePayload {
  purchase_entry_item_id: string;
  quantity: number;
  reason: ReturnReason;
}

export interface PurchaseReturnCreatePayload {
  purchase_entry_id: string;
  reason?: string | null;
  refund_method: RefundMethod;
  lines: PurchaseReturnLinePayload[];
}

export interface PurchaseReturnItem {
  id: string;
  purchase_entry_item_id: string;
  product_id: string;
  product_name: string;
  quantity_returned: number;
  unit_cost_price: number;
  line_refund_amount: number;
  reason: ReturnReason;
}

export interface PurchaseReturn {
  id: string;
  tenant_id: string;
  purchase_entry_id: string;
  purchase_number: string;
  vendor_id: string;
  vendor_name: string;
  return_number: string;
  reason: string | null;
  status: PurchaseReturnStatus;
  subtotal_amount: number;
  tax_adjustment: number;
  refund_amount: number;
  refund_method: RefundMethod;
  created_by: string;
  created_by_name: string;
  created_at: string;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  items: PurchaseReturnItem[];
}

export interface PurchaseReturnListItem {
  id: string;
  return_number: string;
  purchase_entry_id: string;
  purchase_number: string;
  vendor_id: string;
  vendor_name: string;
  status: PurchaseReturnStatus;
  refund_amount: number;
  created_at: string;
}

export interface PurchaseReturnListResult {
  items: PurchaseReturnListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface PurchaseReturnListParams {
  q?: string;
  vendor_id?: string;
  status?: string;
  page: number;
  page_size: number;
}

function returnListSearch(params: PurchaseReturnListParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.vendor_id) search.set('vendor_id', params.vendor_id);
  if (params.status) search.set('status', params.status);
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size));
  return search;
}

export function listReturns(params: PurchaseReturnListParams): Promise<PurchaseReturnListResult> {
  return request(`/api/procurement/returns?${returnListSearch(params).toString()}`);
}

export function getReturn(id: string): Promise<PurchaseReturn> {
  return request(`/api/procurement/returns/${id}`);
}

export function createReturn(payload: PurchaseReturnCreatePayload): Promise<PurchaseReturn> {
  return request('/api/procurement/returns', { method: 'POST', body: JSON.stringify(payload) });
}

export function cancelReturn(id: string, reason?: string | null): Promise<PurchaseReturn> {
  return request(`/api/procurement/returns/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: reason ?? null }) });
}

// --- Vendor payments ---

export type VendorPaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque';

export interface VendorPaymentAllocationPayload {
  purchase_entry_id: string;
  amount: number;
}

export interface VendorPaymentCreatePayload {
  vendor_id: string;
  amount: number;
  payment_method: VendorPaymentMethod;
  reference_number?: string | null;
  notes?: string | null;
  allocations?: VendorPaymentAllocationPayload[] | null;
}

export interface VendorPaymentAllocation {
  id: string;
  purchase_entry_id: string;
  purchase_number: string;
  amount: number;
}

export interface VendorPayment {
  id: string;
  tenant_id: string;
  vendor_id: string;
  vendor_name: string;
  payment_number: string;
  amount: number;
  payment_method: VendorPaymentMethod;
  reference_number: string | null;
  notes: string | null;
  paid_by: string;
  paid_by_name: string;
  created_at: string;
  allocations: VendorPaymentAllocation[];
}

export interface VendorPaymentListResult {
  items: VendorPayment[];
  total: number;
  page: number;
  page_size: number;
}

export function listVendorPayments(params: { vendor_id?: string; page: number; page_size: number }): Promise<VendorPaymentListResult> {
  const search = new URLSearchParams();
  if (params.vendor_id) search.set('vendor_id', params.vendor_id);
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size));
  return request(`/api/procurement/vendor-payments?${search.toString()}`);
}

export function createVendorPayment(payload: VendorPaymentCreatePayload): Promise<VendorPayment> {
  return request('/api/procurement/vendor-payments', { method: 'POST', body: JSON.stringify(payload) });
}

export interface OutstandingPurchase {
  id: string;
  purchase_number: string;
  purchase_date: string;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: string;
}

export function listOutstandingPurchases(vendorId: string): Promise<OutstandingPurchase[]> {
  return request(`/api/procurement/vendors/${vendorId}/outstanding-purchases`);
}

export type VendorLedgerEntryType = 'purchase' | 'payment' | 'return';

export interface VendorLedgerEntry {
  date: string;
  type: VendorLedgerEntryType;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface VendorLedger {
  vendor_id: string;
  vendor_name: string;
  opening_balance: number;
  closing_balance: number;
  entries: VendorLedgerEntry[];
}

export function getVendorLedger(vendorId: string): Promise<VendorLedger> {
  return request(`/api/procurement/vendors/${vendorId}/ledger`);
}

// --- Procurement analytics & reports ---

export interface ProcurementAnalyticsKpis {
  total_purchase_value: number;
  total_purchase_count: number;
  total_return_value: number;
  inventory_value: number;
  gross_profit: number;
  gross_margin_percent: number;
}

export interface PurchaseTrendPoint {
  bucket_label: string;
  purchase_value: number;
  purchase_count: number;
}

export interface VendorAnalysisRow {
  vendor_id: string;
  vendor_name: string;
  purchase_value: number;
  purchase_count: number;
  purchase_quantity: number;
  outstanding_amount: number;
}

export interface ProductAnalysisRow {
  product_id: string;
  product_name: string;
  quantity_purchased: number;
  purchase_value: number;
  avg_cost_price: number;
}

export interface ProcurementAnalytics {
  kpis: ProcurementAnalyticsKpis;
  purchase_trend: PurchaseTrendPoint[];
  vendor_analysis: VendorAnalysisRow[];
  product_analysis: ProductAnalysisRow[];
}

export function getProcurementAnalytics(dateFrom: string, dateTo: string): Promise<ProcurementAnalytics> {
  const search = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  return request(`/api/procurement/analytics?${search.toString()}`);
}

export type AnalyticsWidget = 'kpis' | 'purchase_trend' | 'vendor_analysis' | 'product_analysis' | 'full_analytics';

export function exportProcurementAnalytics(
  widget: AnalyticsWidget,
  format: 'excel' | 'pdf' | 'csv',
  dateFrom: string,
  dateTo: string,
): Promise<Blob> {
  const search = new URLSearchParams({ widget, format, date_from: dateFrom, date_to: dateTo });
  return requestBlob(`/api/procurement/analytics/export?${search.toString()}`);
}

export interface PurchaseReportRow {
  purchase_number: string;
  vendor_name: string;
  purchase_date: string;
  status: string;
  total_amount: number;
  payment_status: string;
  outstanding_amount: number;
}

export interface VendorReportRow {
  vendor_name: string;
  purchase_count: number;
  total_purchase_value: number;
  total_outstanding: number;
  is_active: boolean;
}

export interface OutstandingVendorReportRow {
  vendor_name: string;
  outstanding_amount: number;
  credit_limit: number;
  phone: string | null;
}

export interface PurchaseReturnReportRow {
  return_number: string;
  purchase_number: string;
  vendor_name: string;
  status: string;
  refund_amount: number;
  created_at: string;
}

export interface GstReportRow {
  tax_rate_percent: number;
  taxable_amount: number;
  tax_amount: number;
}

export interface ProcurementReports {
  purchase_report: PurchaseReportRow[];
  vendor_report: VendorReportRow[];
  outstanding_vendor_report: OutstandingVendorReportRow[];
  purchase_return_report: PurchaseReturnReportRow[];
  gst_report: GstReportRow[];
}

export function getProcurementReports(dateFrom: string, dateTo: string): Promise<ProcurementReports> {
  const search = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  return request(`/api/procurement/reports?${search.toString()}`);
}

export type ReportWidget =
  | 'purchase_report'
  | 'vendor_report'
  | 'outstanding_vendor_report'
  | 'purchase_return_report'
  | 'gst_report'
  | 'full_reports';

export function exportProcurementReport(widget: ReportWidget, format: 'excel' | 'pdf' | 'csv', dateFrom: string, dateTo: string): Promise<Blob> {
  const search = new URLSearchParams({ widget, format, date_from: dateFrom, date_to: dateTo });
  return requestBlob(`/api/procurement/reports/export?${search.toString()}`);
}
