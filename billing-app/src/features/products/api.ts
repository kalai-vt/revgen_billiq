import { request, requestBlob } from '@/lib/api-client';

export type IdentifierType = 'pid' | 'sku' | 'barcode' | 'qr_code' | 'model_number' | 'item_code' | 'custom';

export const IDENTIFIER_TYPE_LABELS: Record<IdentifierType, string> = {
  pid: 'Product ID (PID)',
  sku: 'SKU',
  barcode: 'Barcode',
  qr_code: 'QR Code',
  model_number: 'Model Number',
  item_code: 'Item Code',
  custom: 'Custom',
};

export const IDENTIFIER_TYPES: IdentifierType[] = ['pid', 'sku', 'barcode', 'qr_code', 'model_number', 'item_code', 'custom'];

export interface IdentifierItem {
  identifier_type: IdentifierType;
  identifier_label?: string | null;
  identifier_value: string;
}

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  identifier_type: IdentifierType;
  identifier_label: string | null;
  identifier_value: string;
  barcode: string | null;
  category_id: string | null;
  category_name: string | null;
  description: string | null;
  cost_price: number;
  selling_price: number;
  tax_rate_percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  additional_identifiers: IdentifierItem[];
}

export type ProductSortField = 'name' | 'identifier_value' | 'cost_price' | 'selling_price' | 'tax_rate_percent';

export interface ProductListParams {
  q?: string;
  category_id?: string;
  is_active?: boolean;
  page: number;
  page_size: number;
  sort_by?: ProductSortField;
  sort_dir?: 'asc' | 'desc';
}

export interface ProductListResult {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
}

export interface ProductPayload {
  name: string;
  identifier_type: IdentifierType;
  identifier_label?: string | null;
  identifier_value: string;
  barcode?: string | null;
  category_id?: string | null;
  description?: string | null;
  cost_price: number;
  selling_price: number;
  tax_rate_percent: number;
  additional_identifiers?: IdentifierItem[];
}

export function listProducts(params: ProductListParams): Promise<ProductListResult> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.category_id) search.set('category_id', params.category_id);
  if (params.is_active !== undefined) search.set('is_active', String(params.is_active));
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size));
  if (params.sort_by) search.set('sort_by', params.sort_by);
  if (params.sort_dir) search.set('sort_dir', params.sort_dir);
  return request(`/api/products?${search.toString()}`);
}

export function createProduct(payload: ProductPayload): Promise<Product> {
  return request('/api/products', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateProduct(id: string, payload: Partial<ProductPayload> & { is_active?: boolean }): Promise<Product> {
  return request(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteProduct(id: string): Promise<void> {
  return request(`/api/products/${id}`, { method: 'DELETE' });
}

export function generateBarcode(): Promise<{ barcode: string }> {
  return request('/api/catalog/barcode/generate');
}

export interface ProductMatch {
  id: string;
  name: string;
  identifier_value: string;
}

export interface DuplicateCheckResult {
  name_match: ProductMatch | null;
  identifier_match: ProductMatch | null;
  barcode_match: ProductMatch | null;
}

export function checkDuplicate(params: {
  name?: string;
  identifier_value?: string;
  barcode?: string;
  exclude_id?: string;
}): Promise<DuplicateCheckResult> {
  const search = new URLSearchParams();
  if (params.name) search.set('name', params.name);
  if (params.identifier_value) search.set('identifier_value', params.identifier_value);
  if (params.barcode) search.set('barcode', params.barcode);
  if (params.exclude_id) search.set('exclude_id', params.exclude_id);
  return request(`/api/products/check-duplicate?${search.toString()}`);
}

export function exportProducts(
  format: 'excel' | 'pdf' | 'csv',
  params: Omit<ProductListParams, 'page' | 'page_size'>,
): Promise<Blob> {
  const search = new URLSearchParams();
  search.set('format', format);
  if (params.q) search.set('q', params.q);
  if (params.category_id) search.set('category_id', params.category_id);
  if (params.is_active !== undefined) search.set('is_active', String(params.is_active));
  return requestBlob(`/api/products/export?${search.toString()}`);
}

export function downloadImportTemplate(): Promise<Blob> {
  return requestBlob('/api/products/import-template');
}

// --- Bulk import (the "Import Engine") ---

export type CanonicalField = 'name' | 'identifier_value' | 'category' | 'cost_price' | 'selling_price' | 'tax_rate_percent' | 'barcode';

export const CANONICAL_FIELD_LABELS: Record<CanonicalField, string> = {
  name: 'Product Name',
  identifier_value: 'Identifier (PID/SKU)',
  category: 'Category',
  cost_price: 'Cost Price',
  selling_price: 'Selling Price',
  tax_rate_percent: 'Tax %',
  barcode: 'Barcode',
};

export const CANONICAL_FIELDS: CanonicalField[] = [
  'name',
  'identifier_value',
  'category',
  'cost_price',
  'selling_price',
  'tax_rate_percent',
  'barcode',
];

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
  matched_product_id: string | null;
  name: string | null;
  identifier_value: string | null;
  category_name: string | null;
  cost_price: number | null;
  selling_price: number | null;
  tax_rate_percent: number | null;
  barcode: string | null;
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
  identifier_value?: string | null;
  cost_price?: number | null;
  selling_price?: number | null;
  tax_rate_percent?: number | null;
  barcode?: string | null;
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
  return request('/api/products/imports', { method: 'POST', body: formData });
}

export function confirmImportMapping(importId: string, mapping: ColumnMapping): Promise<ImportRowListResult> {
  return request(`/api/products/imports/${importId}/mapping`, { method: 'PUT', body: JSON.stringify({ mapping }) });
}

export function getImportRows(importId: string): Promise<ImportRowListResult> {
  return request(`/api/products/imports/${importId}/rows`);
}

export function updateImportRow(importId: string, rowId: string, payload: ImportRowUpdatePayload): Promise<ImportRow> {
  return request(`/api/products/imports/${importId}/rows/${rowId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function confirmImport(importId: string): Promise<ImportConfirmResult> {
  return request(`/api/products/imports/${importId}/confirm`, { method: 'POST' });
}

export function listImportHistory(page: number, pageSize = 20): Promise<ImportHistoryListResult> {
  return request(`/api/products/imports?page=${page}&page_size=${pageSize}`);
}

export function downloadImportErrorReport(importId: string): Promise<Blob> {
  return requestBlob(`/api/products/imports/${importId}/error-report`);
}
