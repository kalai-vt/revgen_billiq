import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCart, type CartLine } from '@/features/pos/hooks/useCart';
import * as restaurantApi from '@/features/restaurant/api';
import type { RestaurantOrder } from '@/features/restaurant/api';
import type { Product } from '@/features/products/api';
import { NO_TABLE } from '@/features/pos/components/TableSelector';

/** One cart interface over two different backing stores.
 *
 * A counter sale keeps the local (zustand) cart it has always used: it is instant, works offline
 * until checkout, and a business with no tables should never have its till writing to the
 * restaurant module.
 *
 * The moment a table is selected, the cart becomes a *view over that table's open order on the
 * server*. That is what makes Billing and the Tables screen two interfaces to one order rather
 * than two ordering systems — the bug where the same table could end up with two carts and two
 * orders. The server is the source of truth, so the order survives a refresh, a navigation, or
 * being opened on a second till.
 *
 * Both modes expose the same shape, so every consumer (CartPanel, CheckoutPanel, totals) is
 * unchanged and cannot tell which one is active.
 */
export interface OrderCart {
  lines: CartLine[];
  addProduct: (product: Product) => void;
  setQuantity: (productId: string, quantity: number) => void;
  setPrice: (productId: string, price: number | null) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
  /** Replaces the whole cart at once — resuming a held bill. Counter-sale only: a held bill has
   * no table, so this is a no-op in table mode and callers clear the table first. */
  setLines: (lines: CartLine[]) => void;
  /** The server order behind this cart, when a table is selected. */
  order: RestaurantOrder | null;
  isTableMode: boolean;
  isSyncing: boolean;
}

/** An order item carries everything the cart actually renders and prices with — name, identifier,
 * unit price, tax rate — so the line is rebuilt from it rather than re-fetching the product. The
 * unit price is deliberately the one recorded on the order, not today's catalogue price: a tab
 * opened an hour ago must not silently reprice when someone edits the menu. */
function lineFromOrderItem(item: RestaurantOrder['items'][number]): CartLine {
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

export function useOrderCart(tableId: string): OrderCart {
  const localCart = useCart();
  const queryClient = useQueryClient();
  const isTableMode = tableId !== NO_TABLE;

  const { data: order } = useQuery({
    queryKey: ['restaurant', 'table-order', tableId],
    queryFn: () => restaurantApi.getTableActiveOrder(tableId),
    enabled: isTableMode,
  });

  /** Every mutation refreshes the order *and* the floor board, so a table taken or freed here is
   * reflected on the Tables screen without a reload — the "near real-time" half of keeping the
   * two screens honest with each other. */
  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['restaurant'] });
  }

  const addItem = useMutation({
    mutationFn: (product: Product) =>
      restaurantApi.openTableOrder(tableId, [{ product_id: product.id, quantity: 1 }]),
    onSuccess: refresh,
  });

  const setQuantityMutation = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      restaurantApi.updateOrderItem(order!.id, itemId, { quantity }),
    onSuccess: refresh,
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => restaurantApi.removeOrderItem(order!.id, itemId),
    onSuccess: refresh,
  });

  const lines = useMemo(
    () => (order?.items ?? []).filter((item) => !item.is_cancelled).map(lineFromOrderItem),
    [order],
  );

  if (!isTableMode) {
    return {
      lines: localCart.lines,
      addProduct: localCart.addProduct,
      setQuantity: localCart.setQuantity,
      setPrice: localCart.setPrice,
      removeLine: localCart.removeLine,
      clear: localCart.clear,
      setLines: localCart.setLines,
      order: null,
      isTableMode: false,
      isSyncing: false,
    };
  }

  function itemIdFor(productId: string): string | undefined {
    return (order?.items ?? []).find((item) => item.product_id === productId && !item.is_cancelled)?.id;
  }

  return {
    lines,
    addProduct: (product) => addItem.mutate(product),
    setQuantity: (productId, quantity) => {
      const itemId = itemIdFor(productId);
      if (!itemId) return;
      // Zero means gone: the order screen has no concept of a zero-quantity line, and leaving one
      // behind would send the kitchen a ticket for nothing.
      if (quantity <= 0) removeMutation.mutate(itemId);
      else setQuantityMutation.mutate({ itemId, quantity });
    },
    // Per-line price overrides are a counter-sale tool. A dine-in tab prices from the order, and
    // a discount on it goes through the bill, so this is a deliberate no-op in table mode.
    setPrice: () => undefined,
    removeLine: (productId) => {
      const itemId = itemIdFor(productId);
      if (itemId) removeMutation.mutate(itemId);
    },
    clear: () => {
      for (const item of order?.items ?? []) {
        if (!item.is_cancelled) removeMutation.mutate(item.id);
      }
    },
    setLines: () => undefined,
    order: order ?? null,
    isTableMode: true,
    isSyncing: addItem.isPending || setQuantityMutation.isPending || removeMutation.isPending,
  };
}
