import { request, requestBlob } from '@/lib/api-client';

export type CommercePlatform = 'swiggy' | 'zomato';
export type IntegrationStatus = 'not_connected' | 'pending_partner_approval' | 'connected' | 'error';
export type IntegrationMode = 'mock' | 'live';
export type CommerceOrderStatus = 'received' | 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled';

export interface CommerceIntegrationConfig {
  id: string;
  tenant_id: string;
  platform: CommercePlatform;
  is_enabled: boolean;
  status: IntegrationStatus;
  mode: IntegrationMode;
  has_api_key: boolean;
  has_api_secret: boolean;
  store_id: string | null;
  store_name: string | null;
  webhook_path: string;
  last_synced_at: string | null;
  last_sync_status: string | null;
  auto_create_invoice: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommerceIntegrationConfigPayload {
  is_enabled?: boolean;
  mode?: IntegrationMode;
  api_key?: string | null;
  api_secret?: string | null;
  store_id?: string | null;
  store_name?: string | null;
  auto_create_invoice?: boolean;
  status?: IntegrationStatus;
}

export function listConfigs(): Promise<CommerceIntegrationConfig[]> {
  return request('/api/commerce/configs');
}

export function getConfig(platform: CommercePlatform): Promise<CommerceIntegrationConfig> {
  return request(`/api/commerce/configs/${platform}`);
}

export function updateConfig(platform: CommercePlatform, payload: CommerceIntegrationConfigPayload): Promise<CommerceIntegrationConfig> {
  return request(`/api/commerce/configs/${platform}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function regenerateWebhookToken(platform: CommercePlatform): Promise<CommerceIntegrationConfig> {
  return request(`/api/commerce/configs/${platform}/regenerate-webhook-token`, { method: 'POST' });
}

// --- Orders ---

export interface CommerceOrderItem {
  id: string;
  product_id: string | null;
  platform_sku: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface CommerceOrder {
  id: string;
  tenant_id: string;
  platform: CommercePlatform;
  platform_order_id: string;
  order_status: CommerceOrderStatus;
  raw_status: string | null;
  order_time: string;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  platform_discount: number;
  platform_commission: number;
  packaging_charge: number;
  tax_amount: number;
  total_amount: number;
  payout_amount: number;
  invoice_id: string | null;
  invoice_number: string | null;
  sync_error: string | null;
  created_at: string;
  items: CommerceOrderItem[];
}

export interface CommerceOrderListItem {
  id: string;
  platform: CommercePlatform;
  platform_order_id: string;
  order_status: CommerceOrderStatus;
  order_time: string;
  customer_name: string | null;
  total_amount: number;
  invoice_id: string | null;
  sync_error: string | null;
}

export interface CommerceOrderListResult {
  items: CommerceOrderListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface CommerceOrderListParams {
  platform?: string;
  status?: string;
  q?: string;
  page: number;
  page_size: number;
}

export function listOrders(params: CommerceOrderListParams): Promise<CommerceOrderListResult> {
  const search = new URLSearchParams();
  if (params.platform) search.set('platform', params.platform);
  if (params.status) search.set('status', params.status);
  if (params.q) search.set('q', params.q);
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size));
  return request(`/api/commerce/orders?${search.toString()}`);
}

export function getOrder(id: string): Promise<CommerceOrder> {
  return request(`/api/commerce/orders/${id}`);
}

export function triggerMockOrder(platform: CommercePlatform, itemCount = 2): Promise<CommerceOrder> {
  return request('/api/commerce/orders/mock-trigger', { method: 'POST', body: JSON.stringify({ platform, item_count: itemCount }) });
}

export function retryBilling(orderId: string): Promise<CommerceOrder> {
  return request(`/api/commerce/orders/${orderId}/retry-billing`, { method: 'POST' });
}

// --- Product mapping ---

export interface CommerceProductMapping {
  id: string;
  platform: CommercePlatform;
  platform_sku: string;
  platform_item_name: string | null;
  product_id: string;
  product_name: string;
  created_at: string;
}

export interface UnmappedSku {
  platform: CommercePlatform;
  platform_sku: string;
  item_name: string;
  order_count: number;
}

export function listProductMappings(): Promise<CommerceProductMapping[]> {
  return request('/api/commerce/product-mappings');
}

export function createProductMapping(platform: CommercePlatform, platformSku: string, productId: string): Promise<CommerceProductMapping> {
  return request('/api/commerce/product-mappings', {
    method: 'POST',
    body: JSON.stringify({ platform, platform_sku: platformSku, product_id: productId }),
  });
}

export function listUnmappedSkus(): Promise<UnmappedSku[]> {
  return request('/api/commerce/unmapped-skus');
}

// --- Dashboard ---

export interface CommerceDashboardKpis {
  total_online_orders: number;
  swiggy_orders: number;
  zomato_orders: number;
  total_online_revenue: number;
  average_order_value: number;
  cancelled_orders: number;
  unmapped_sku_count: number;
}

export interface ChannelComparisonRow {
  platform: string;
  revenue: number;
  orders: number;
  average_order_value: number;
  cancelled_orders: number;
}

export interface CommerceTrendPoint {
  bucket_label: string;
  swiggy_revenue: number;
  zomato_revenue: number;
  total_revenue: number;
  order_count: number;
}

export interface TopCommerceProduct {
  product_name: string;
  quantity_sold: number;
  revenue: number;
}

export interface CommerceDashboard {
  kpis: CommerceDashboardKpis;
  channel_comparison: ChannelComparisonRow[];
  revenue_trend: CommerceTrendPoint[];
  top_products: TopCommerceProduct[];
}

export function getCommerceDashboard(dateFrom: string, dateTo: string): Promise<CommerceDashboard> {
  const search = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  return request(`/api/commerce/dashboard?${search.toString()}`);
}

export type CommerceWidget = 'kpis' | 'channel_comparison' | 'revenue_trend' | 'top_products' | 'full_dashboard';

export function exportCommerceDashboard(widget: CommerceWidget, format: 'excel' | 'pdf' | 'csv', dateFrom: string, dateTo: string): Promise<Blob> {
  const search = new URLSearchParams({ widget, format, date_from: dateFrom, date_to: dateTo });
  return requestBlob(`/api/commerce/dashboard/export?${search.toString()}`);
}
