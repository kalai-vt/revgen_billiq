import { request } from '@/lib/api-client';

/** Dine-in table service. The whole module follows one chain — Table → Order → KOT → Invoice —
 * so an order accumulates over the sitting, a KOT is a subset of it sent to the kitchen, and
 * billing turns it into an ordinary invoice rather than a second, parallel sale. */

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'billing' | 'cleaning';
export type OrderType = 'dine_in' | 'takeaway';
export type OrderStatus = 'open' | 'billed' | 'cancelled' | 'merged';
export type KotStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';

/** Only the statuses a human sets. `occupied`/`billing` follow from the order on the table and
 * are managed server-side, so offering them here would let the board drift from reality. */
export const SETTABLE_TABLE_STATUSES = ['available', 'reserved', 'cleaning'] as const;
export type SettableTableStatus = (typeof SETTABLE_TABLE_STATUSES)[number];

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  billing: 'Billing',
  cleaning: 'Cleaning',
};

export const KOT_STATUS_LABELS: Record<KotStatus, string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  cancelled: 'Cancelled',
};

export interface Floor {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface RestaurantTable {
  id: string;
  name: string;
  floor_id: string | null;
  seats: number;
  status: TableStatus;
  sort_order: number;
  is_active: boolean;
}

export interface TableWithOrder extends RestaurantTable {
  active_order_id: string | null;
  active_order_number: string | null;
  active_order_total: number | null;
  active_order_item_count: number | null;
  active_order_opened_at: string | null;
}

export interface FloorLayout {
  floor: Floor | null;
  tables: TableWithOrder[];
}

export interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  identifier_value: string | null;
  quantity: number;
  unit_price: number;
  tax_rate_percent: number;
  notes: string | null;
  sent_quantity: number;
  is_cancelled: boolean;
  line_total: number;
}

export interface OrderTotals {
  subtotal: number;
  tax_amount: number;
  total: number;
  item_count: number;
}

export interface KotItem {
  id: string;
  order_item_id: string;
  product_name: string;
  quantity: number;
  notes: string | null;
}

export interface Kot {
  id: string;
  kot_number: string;
  order_id: string;
  status: KotStatus;
  notes: string | null;
  cancel_reason: string | null;
  print_count: number;
  print_status: 'pending' | 'printed' | 'failed';
  last_print_error: string | null;
  created_at: string;
  items: KotItem[];
}

export interface RestaurantOrder {
  id: string;
  order_number: string;
  order_type: OrderType;
  status: OrderStatus;
  table_id: string | null;
  table_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  guest_count: number | null;
  notes: string | null;
  invoice_id: string | null;
  merged_into_order_id: string | null;
  created_at: string;
  closed_at: string | null;
  items: OrderItem[];
  totals: OrderTotals | null;
  kots: Kot[];
}

export interface OrderItemInput {
  product_id: string;
  quantity: number;
  unit_price?: number | null;
  notes?: string | null;
}

// ---- Floors ----

export function listFloors(): Promise<Floor[]> {
  return request('/api/restaurant/floors');
}

export function createFloor(payload: { name: string; sort_order?: number }): Promise<Floor> {
  return request('/api/restaurant/floors', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateFloor(id: string, payload: Partial<Floor>): Promise<Floor> {
  return request(`/api/restaurant/floors/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteFloor(id: string): Promise<null> {
  return request(`/api/restaurant/floors/${id}`, { method: 'DELETE' });
}

// ---- Tables ----

export function listTables(floorId?: string): Promise<RestaurantTable[]> {
  return request(`/api/restaurant/tables${floorId ? `?floor_id=${encodeURIComponent(floorId)}` : ''}`);
}

/** The whole floor board in one request — every floor, its tables, and the open order on each. */
export function getLayout(): Promise<FloorLayout[]> {
  return request('/api/restaurant/layout');
}

export function createTable(payload: {
  name: string;
  floor_id?: string | null;
  seats?: number;
  sort_order?: number;
}): Promise<RestaurantTable> {
  return request('/api/restaurant/tables', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateTable(id: string, payload: Partial<RestaurantTable>): Promise<RestaurantTable> {
  return request(`/api/restaurant/tables/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function setTableStatus(id: string, status: SettableTableStatus): Promise<RestaurantTable> {
  return request(`/api/restaurant/tables/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
}

export function deleteTable(id: string): Promise<null> {
  return request(`/api/restaurant/tables/${id}`, { method: 'DELETE' });
}

// ---- Orders ----

export function listOrders(params: { status?: OrderStatus; table_id?: string } = {}): Promise<RestaurantOrder[]> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.table_id) query.set('table_id', params.table_id);
  const suffix = query.toString();
  return request(`/api/restaurant/orders${suffix ? `?${suffix}` : ''}`);
}

export function getOrder(id: string): Promise<RestaurantOrder> {
  return request(`/api/restaurant/orders/${id}`);
}

export function createOrder(payload: {
  order_type: OrderType;
  table_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  guest_count?: number | null;
  notes?: string | null;
  items?: OrderItemInput[];
}): Promise<RestaurantOrder> {
  return request('/api/restaurant/orders', { method: 'POST', body: JSON.stringify(payload) });
}

export function addOrderItems(orderId: string, items: OrderItemInput[]): Promise<RestaurantOrder> {
  return request(`/api/restaurant/orders/${orderId}/items`, { method: 'POST', body: JSON.stringify(items) });
}

export function updateOrderItem(
  orderId: string,
  itemId: string,
  payload: { quantity?: number; notes?: string | null },
): Promise<RestaurantOrder> {
  return request(`/api/restaurant/orders/${orderId}/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function removeOrderItem(orderId: string, itemId: string): Promise<RestaurantOrder> {
  return request(`/api/restaurant/orders/${orderId}/items/${itemId}`, { method: 'DELETE' });
}

export function cancelOrder(orderId: string): Promise<RestaurantOrder> {
  return request(`/api/restaurant/orders/${orderId}/cancel`, { method: 'POST' });
}

export function transferOrder(orderId: string, toTableId: string): Promise<RestaurantOrder> {
  return request(`/api/restaurant/orders/${orderId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ to_table_id: toTableId }),
  });
}

export function mergeOrders(targetOrderId: string, sourceOrderIds: string[]): Promise<RestaurantOrder> {
  return request(`/api/restaurant/orders/${targetOrderId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ source_order_ids: sourceOrderIds }),
  });
}

export function splitOrder(
  orderId: string,
  items: { order_item_id: string; quantity: number }[],
  toTableId?: string | null,
): Promise<RestaurantOrder> {
  return request(`/api/restaurant/orders/${orderId}/split`, {
    method: 'POST',
    body: JSON.stringify({ items, to_table_id: toTableId ?? null }),
  });
}

/** Opens (or reuses) the table's running order and appends these items — the "fire to the kitchen
 * now, bill later" step from the Billing screen. */
export function openTableOrder(tableId: string, items: OrderItemInput[]): Promise<RestaurantOrder> {
  return request(`/api/restaurant/tables/${tableId}/order`, { method: 'POST', body: JSON.stringify(items) });
}

/** The table's open order, or null when it's free. Both Billing and the table board read this so
 * they resume one tab instead of each starting their own. */
export function getTableActiveOrder(tableId: string): Promise<RestaurantOrder | null> {
  return request(`/api/restaurant/tables/${tableId}/active-order`);
}

/** Frees an occupied table. Releases the occupancy, never the table configuration —
 * `cancelOrder` is required before a tab with items is discarded. */
export function releaseTable(tableId: string, cancelOrder = false): Promise<RestaurantTable> {
  return request(`/api/restaurant/tables/${tableId}/release`, {
    method: 'POST',
    body: JSON.stringify({ cancel_order: cancelOrder }),
  });
}

export interface TableQuickBillPayload extends BillOrderPayload {
  table_id: string;
  items: OrderItemInput[];
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
}

/** Bills a cart straight to a table from the Billing screen. The table board flow still exists for
 * a running tab; this is the counter-style case where the cart is already rung up. */
export function quickBillTable(
  payload: TableQuickBillPayload,
): Promise<{ invoice_id: string; invoice_number: string }> {
  return request('/api/restaurant/tables/quick-bill', { method: 'POST', body: JSON.stringify(payload) });
}

export interface BillOrderPayload {
  payment_method?: 'cash' | 'card' | 'upi';
  payment_reference?: string | null;
  discount_type?: 'flat' | 'percent' | null;
  discount_value?: number;
  tax_percentage?: number | null;
  amount_tendered?: number | null;
  mark_paid?: boolean;
  client_reference_id?: string | null;
}

export function billOrder(
  orderId: string,
  payload: BillOrderPayload,
): Promise<{ invoice_id: string; invoice_number: string }> {
  return request(`/api/restaurant/orders/${orderId}/bill`, { method: 'POST', body: JSON.stringify(payload) });
}

// ---- KOT ----

export function listKots(status?: KotStatus): Promise<Kot[]> {
  return request(`/api/restaurant/kots${status ? `?status=${status}` : ''}`);
}

/** Sends items to the kitchen. Omit `items` to send everything not yet sent — the common
 * "fire the order" action, and the one that can't get quantities wrong. */
export function createKot(
  orderId: string,
  payload: { items?: { order_item_id: string; quantity: number }[]; notes?: string | null } = {},
): Promise<Kot> {
  return request(`/api/restaurant/orders/${orderId}/kot`, { method: 'POST', body: JSON.stringify(payload) });
}

export function setKotStatus(kotId: string, status: KotStatus): Promise<Kot> {
  return request(`/api/restaurant/kots/${kotId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
}

export function cancelKot(kotId: string, reason: string): Promise<Kot> {
  return request(`/api/restaurant/kots/${kotId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}

/** A reprint bumps the counter on the same KOT — a second KOT would tell the kitchen to cook
 * the food twice. */
/** Records that a ticket could not be printed. The KOT itself is untouched — the food was
 * ordered whether or not paper came out — so it stays on screen and can be retried. */
export function markKotPrintFailed(kotId: string, error?: string | null): Promise<Kot> {
  return request(`/api/restaurant/kots/${kotId}/print-failed`, {
    method: 'POST',
    body: JSON.stringify({ error: error ?? null }),
  });
}

export function markKotPrinted(kotId: string): Promise<Kot> {
  return request(`/api/restaurant/kots/${kotId}/printed`, { method: 'POST' });
}
