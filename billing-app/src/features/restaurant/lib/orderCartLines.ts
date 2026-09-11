import type { CartLine } from '@/features/pos/hooks/useCart';
import type { OrderItem, RestaurantOrder } from '@/features/restaurant/api';
import type { Product } from '@/features/products/api';

/** Turns a restaurant order into the cart lines Billing's components render.
 *
 * Shared by the Billing screen (in table mode) and the Table Order page so both draw one order
 * exactly the same way — the mapping living in one place is what stops them drifting.
 *
 * The unit price is the one recorded on the order, not today's catalogue price: a tab opened an
 * hour ago must not silently reprice because someone edited the menu.
 */
export function cartLineFromOrderItem(item: OrderItem): CartLine {
  const product = {
    id: item.product_id,
    name: item.product_name,
    identifier_value: item.identifier_value,
    category_name: null,
    selling_price: item.unit_price,
    tax_rate_percent: item.tax_rate_percent,
  } as unknown as Product;
  return { product, quantity: item.quantity, overridePrice: null };
}

export function cartLinesFromOrder(order: RestaurantOrder | null | undefined): CartLine[] {
  return (order?.items ?? []).filter((item) => !item.is_cancelled).map(cartLineFromOrderItem);
}

/** The order item behind a cart line. Cart components address lines by product id; the order
 * addresses them by item id, and this is the one place that bridges the two. */
export function orderItemForProduct(
  order: RestaurantOrder | null | undefined,
  productId: string,
): OrderItem | undefined {
  return (order?.items ?? []).find((item) => item.product_id === productId && !item.is_cancelled);
}
