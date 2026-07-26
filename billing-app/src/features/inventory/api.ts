import { request, requestBlob } from '@/lib/api-client';

export type StockReason = 'purchase' | 'damage' | 'return' | 'adjustment' | 'opening_stock' | 'manual_correction';
export type MovementType = 'add' | 'reduce' | 'adjust';

export const STOCK_REASON_LABELS: Record<StockReason, string> = {
  purchase: 'Purchase',
  damage: 'Damage',
  return: 'Return',
  adjustment: 'Adjustment',
  opening_stock: 'Opening Stock',
  manual_correction: 'Manual Correction',
};

export const STOCK_REASONS: StockReason[] = [
  'purchase',
  'damage',
  'return',
  'adjustment',
  'opening_stock',
  'manual_correction',
];

export interface InventoryItem {
  product_id: string;
  product_name: string;
  identifier_type: string;
  identifier_value: string;
  category_name: string | null;
  quantity: number;
  reorder_level: number;
  cost_price: number;
  selling_price: number;
  tax_rate_percent: number;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  updated_at: string;
}

export type InventorySortField = 'name' | 'quantity' | 'cost_price' | 'selling_price' | 'updated_at';

export interface InventoryListParams {
  q?: string;
  category_id?: string;
  stock_status?: 'low' | 'out';
  page: number;
  page_size: number;
  sort_by?: InventorySortField;
  sort_dir?: 'asc' | 'desc';
}

export interface InventoryListResult {
  items: InventoryItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface InventoryDashboard {
  total_products: number;
  total_stock_quantity: number;
  inventory_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
  recently_updated: InventoryItem[];
}

export interface StockAdjustPayload {
  movement_type: MovementType;
  quantity: number;
  reason: StockReason;
  notes?: string | null;
}

export interface StockHistoryEntry {
  id: string;
  product_id: string;
  product_name: string;
  previous_stock: number;
  added: number;
  removed: number;
  current_stock: number;
  reason: string;
  source: string;
  notes: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

export interface StockHistoryListParams {
  product_id?: string;
  page: number;
  page_size: number;
}

export interface StockHistoryListResult {
  items: StockHistoryEntry[];
  total: number;
  page: number;
  page_size: number;
}

export function getDashboard(): Promise<InventoryDashboard> {
  return request('/api/inventory/dashboard');
}

export function listInventory(params: InventoryListParams): Promise<InventoryListResult> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.category_id) search.set('category_id', params.category_id);
  if (params.stock_status) search.set('stock_status', params.stock_status);
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size));
  if (params.sort_by) search.set('sort_by', params.sort_by);
  if (params.sort_dir) search.set('sort_dir', params.sort_dir);
  return request(`/api/inventory?${search.toString()}`);
}

export function adjustStock(productId: string, payload: StockAdjustPayload): Promise<StockHistoryEntry> {
  return request(`/api/inventory/${productId}/adjust`, { method: 'POST', body: JSON.stringify(payload) });
}

export function listStockHistory(params: StockHistoryListParams): Promise<StockHistoryListResult> {
  const search = new URLSearchParams();
  if (params.product_id) search.set('product_id', params.product_id);
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size));
  return request(`/api/inventory/stock-history?${search.toString()}`);
}

export function exportInventory(format: 'excel' | 'pdf' | 'csv', params: Omit<InventoryListParams, 'page' | 'page_size'>): Promise<Blob> {
  const search = new URLSearchParams();
  search.set('format', format);
  if (params.q) search.set('q', params.q);
  if (params.category_id) search.set('category_id', params.category_id);
  if (params.stock_status) search.set('stock_status', params.stock_status);
  return requestBlob(`/api/inventory/export?${search.toString()}`);
}

export function downloadImportTemplate(): Promise<Blob> {
  return requestBlob('/api/inventory/import-template');
}

// --- Bulk import (the "Import Engine") ---

export type CanonicalField =
  | 'pid'
  | 'sku'
  | 'product_name'
  | 'category'
  | 'quantity'
  | 'cost_price'
  | 'selling_price'
  | 'tax_percent'
  | 'notes';

export const CANONICAL_FIELD_LABELS: Record<CanonicalField, string> = {
  pid: 'Product ID (PID)',
  sku: 'SKU',
  product_name: 'Product Name',
  category: 'Category',
  quantity: 'Quantity',
  cost_price: 'Cost Price',
  selling_price: 'Selling Price',
  tax_percent: 'Tax %',
  notes: 'Notes',
};

export const CANONICAL_FIELDS: CanonicalField[] = [
  'pid',
  'sku',
  'product_name',
  'category',
  'quantity',
  'cost_price',
  'selling_price',
  'tax_percent',
  'notes',
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
  product_name: string | null;
  current_stock: number | null;
  quantity: number | null;
  cost_price: number | null;
  selling_price: number | null;
  tax_percent: number | null;
  notes: string | null;
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
  quantity?: number | null;
  cost_price?: number | null;
  selling_price?: number | null;
  tax_percent?: number | null;
  notes?: string | null;
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
  return request('/api/inventory/imports', { method: 'POST', body: formData });
}

export function confirmImportMapping(importId: string, mapping: ColumnMapping): Promise<ImportRowListResult> {
  return request(`/api/inventory/imports/${importId}/mapping`, { method: 'PUT', body: JSON.stringify({ mapping }) });
}

export function getImportRows(importId: string): Promise<ImportRowListResult> {
  return request(`/api/inventory/imports/${importId}/rows`);
}

export function updateImportRow(importId: string, rowId: string, payload: ImportRowUpdatePayload): Promise<ImportRow> {
  return request(`/api/inventory/imports/${importId}/rows/${rowId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function confirmImport(importId: string): Promise<ImportConfirmResult> {
  return request(`/api/inventory/imports/${importId}/confirm`, { method: 'POST' });
}

export function listImportHistory(page: number, pageSize = 20): Promise<ImportHistoryListResult> {
  return request(`/api/inventory/imports?page=${page}&page_size=${pageSize}`);
}

export function downloadImportErrorReport(importId: string): Promise<Blob> {
  return requestBlob(`/api/inventory/imports/${importId}/error-report`);
}
