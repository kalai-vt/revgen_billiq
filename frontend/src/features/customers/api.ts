import { request, requestBlob } from '@/lib/api-client';

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  is_credit_enabled: boolean;
  credit_limit: number | null;
  credit_days: number | null;
  allow_credit_beyond_limit: boolean;
  require_manager_approval: boolean;
  auto_block_credit: boolean;
  outstanding_amount: number;
  overdue_amount: number;
  due_invoices_count: number;
  overdue_invoices_count: number;
  last_payment_date: string | null;
  created_at: string;
  updated_at: string;
}

export type CustomerSortField = 'name' | 'mobile' | 'email';

export interface CustomerListParams {
  q?: string;
  is_active?: boolean;
  page: number;
  page_size: number;
  sort_by?: CustomerSortField;
  sort_dir?: 'asc' | 'desc';
  has_outstanding?: boolean;
  has_overdue?: boolean;
  due_today?: boolean;
  due_this_week?: boolean;
  credit_enabled?: boolean;
  credit_limit_exceeded?: boolean;
}

export interface CustomerListResult {
  items: Customer[];
  total: number;
  page: number;
  page_size: number;
}

export interface CustomerPayload {
  name: string;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  is_credit_enabled?: boolean;
  credit_limit?: number | null;
  credit_days?: number | null;
  allow_credit_beyond_limit?: boolean;
  require_manager_approval?: boolean;
  auto_block_credit?: boolean;
}

function customerListSearch(params: CustomerListParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.is_active !== undefined) search.set('is_active', String(params.is_active));
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size));
  if (params.sort_by) search.set('sort_by', params.sort_by);
  if (params.sort_dir) search.set('sort_dir', params.sort_dir);
  if (params.has_outstanding !== undefined) search.set('has_outstanding', String(params.has_outstanding));
  if (params.has_overdue !== undefined) search.set('has_overdue', String(params.has_overdue));
  if (params.due_today !== undefined) search.set('due_today', String(params.due_today));
  if (params.due_this_week !== undefined) search.set('due_this_week', String(params.due_this_week));
  if (params.credit_enabled !== undefined) search.set('credit_enabled', String(params.credit_enabled));
  if (params.credit_limit_exceeded !== undefined) search.set('credit_limit_exceeded', String(params.credit_limit_exceeded));
  return search;
}

export function listCustomers(params: CustomerListParams): Promise<CustomerListResult> {
  return request(`/api/customers?${customerListSearch(params).toString()}`);
}

export function getCustomer(id: string): Promise<Customer> {
  return request(`/api/customers/${id}`);
}

export function createCustomer(payload: CustomerPayload): Promise<Customer> {
  return request('/api/customers', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateCustomer(id: string, payload: Partial<CustomerPayload> & { is_active?: boolean }): Promise<Customer> {
  return request(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteCustomer(id: string): Promise<void> {
  return request(`/api/customers/${id}`, { method: 'DELETE' });
}

export function exportCustomers(
  format: 'excel' | 'pdf' | 'csv',
  params: Omit<CustomerListParams, 'page' | 'page_size'>,
): Promise<Blob> {
  const search = new URLSearchParams();
  search.set('format', format);
  if (params.q) search.set('q', params.q);
  if (params.is_active !== undefined) search.set('is_active', String(params.is_active));
  return requestBlob(`/api/customers/export?${search.toString()}`);
}

export function downloadImportTemplate(): Promise<Blob> {
  return requestBlob('/api/customers/import-template');
}

// --- Bulk import (the "Import Engine") ---

export type CanonicalField = 'name' | 'mobile' | 'email' | 'address';

export const CANONICAL_FIELD_LABELS: Record<CanonicalField, string> = {
  name: 'Customer Name',
  mobile: 'Mobile',
  email: 'Email',
  address: 'Address',
};

export const CANONICAL_FIELDS: CanonicalField[] = ['name', 'mobile', 'email', 'address'];

export type ColumnMapping = Partial<Record<CanonicalField, string | null>>;

export interface ImportUploadResult {
  import_id: string;
  file_name: string;
  source_type: string;
  status: string;
  rows_total: number;
  detected_headers: string[];
  auto_mapping: ColumnMapping;
  requires_mapping: boolean;
}

export type ImportRowStatus = 'ready' | 'warning' | 'error';

export interface ImportRow {
  id: string;
  row_number: number;
  matched_customer_id: string | null;
  name: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  status: ImportRowStatus;
  error_messages: string[];
  is_skipped: boolean;
}

export interface ImportRowListResult {
  import_id: string;
  status: string;
  items: ImportRow[];
  total: number;
  ready_count: number;
  warning_count: number;
  error_count: number;
  skipped_count: number;
}

export interface ImportRowUpdatePayload {
  name?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  is_skipped?: boolean;
}

export interface ImportConfirmResult {
  import_id: string;
  status: string;
  rows_imported: number;
  rows_failed: number;
  rows_skipped: number;
}

export interface ImportHistoryEntry {
  id: string;
  file_name: string;
  source_type: string;
  status: string;
  rows_total: number;
  rows_imported: number;
  rows_failed: number;
  imported_by: string;
  imported_by_name: string;
  created_at: string;
  completed_at: string | null;
}

export interface ImportHistoryListResult {
  items: ImportHistoryEntry[];
  total: number;
  page: number;
  page_size: number;
}

export function uploadImportFile(file: File): Promise<ImportUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  return request('/api/customers/imports', { method: 'POST', body: formData });
}

export function confirmImportMapping(importId: string, mapping: ColumnMapping): Promise<ImportRowListResult> {
  return request(`/api/customers/imports/${importId}/mapping`, { method: 'PUT', body: JSON.stringify({ mapping }) });
}

export function getImportRows(importId: string): Promise<ImportRowListResult> {
  return request(`/api/customers/imports/${importId}/rows`);
}

export function updateImportRow(importId: string, rowId: string, payload: ImportRowUpdatePayload): Promise<ImportRow> {
  return request(`/api/customers/imports/${importId}/rows/${rowId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function confirmImport(importId: string): Promise<ImportConfirmResult> {
  return request(`/api/customers/imports/${importId}/confirm`, { method: 'POST' });
}

export function listImportHistory(page: number, pageSize = 20): Promise<ImportHistoryListResult> {
  return request(`/api/customers/imports?page=${page}&page_size=${pageSize}`);
}

export function downloadImportErrorReport(importId: string): Promise<Blob> {
  return requestBlob(`/api/customers/imports/${importId}/error-report`);
}
