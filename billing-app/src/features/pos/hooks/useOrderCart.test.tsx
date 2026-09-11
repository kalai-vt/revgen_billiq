import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useOrderCart } from '@/features/pos/hooks/useOrderCart';
import { useCartStore } from '@/features/pos/store/cartStore';
import * as restaurantApi from '@/features/restaurant/api';
import type { RestaurantOrder } from '@/features/restaurant/api';
import type { Product } from '@/features/products/api';
import { NO_TABLE } from '@/features/pos/components/TableSelector';

vi.mock('@/features/restaurant/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/restaurant/api')>()),
  getTableActiveOrder: vi.fn(),
  openTableOrder: vi.fn(),
  updateOrderItem: vi.fn(),
  removeOrderItem: vi.fn(),
}));

const product = { id: 'p1', name: 'Masala Dosa', selling_price: 120, tax_rate_percent: 5 } as unknown as Product;

const order = {
  id: 'o1',
  order_number: 'ORD-000012',
  items: [
    {
      id: 'i1',
      product_id: 'p1',
      product_name: 'Masala Dosa',
      identifier_value: 'MD-01',
      quantity: 2,
      unit_price: 120,
      tax_rate_percent: 5,
      is_cancelled: false,
    },
  ],
} as unknown as RestaurantOrder;

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  useCartStore.setState({ lines: [] });
  vi.mocked(restaurantApi.getTableActiveOrder).mockResolvedValue(order);
  vi.mocked(restaurantApi.openTableOrder).mockResolvedValue(order);
  vi.mocked(restaurantApi.updateOrderItem).mockResolvedValue(order);
  vi.mocked(restaurantApi.removeOrderItem).mockResolvedValue(order);
});

describe('useOrderCart — counter sales are untouched', () => {
  it('uses the local cart and never calls the restaurant API', async () => {
    const { result } = renderHook(() => useOrderCart(NO_TABLE), { wrapper });
    act(() => result.current.addProduct(product));

    expect(result.current.isTableMode).toBe(false);
    expect(result.current.order).toBeNull();
    // A business with no tables must never have its till writing to the restaurant module.
    expect(restaurantApi.getTableActiveOrder).not.toHaveBeenCalled();
    expect(restaurantApi.openTableOrder).not.toHaveBeenCalled();
    expect(useCartStore.getState().lines).toHaveLength(1);
  });
});

describe('useOrderCart — table mode reads the server order', () => {
  it('renders the table order as cart lines', async () => {
    const { result } = renderHook(() => useOrderCart('t1'), { wrapper });
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    expect(result.current.isTableMode).toBe(true);
    expect(result.current.lines[0].product.name).toBe('Masala Dosa');
    expect(result.current.lines[0].quantity).toBe(2);
  });

  it('prices from the order, not from today’s catalogue', async () => {
    const repriced = { ...order, items: [{ ...order.items[0], unit_price: 99 }] } as RestaurantOrder;
    vi.mocked(restaurantApi.getTableActiveOrder).mockResolvedValue(repriced);
    const { result } = renderHook(() => useOrderCart('t1'), { wrapper });
    // A tab opened an hour ago must not silently reprice because someone edited the menu.
    await waitFor(() => expect(result.current.lines[0].product.selling_price).toBe(99));
  });

  it('hides cancelled items', async () => {
    const withCancelled = {
      ...order,
      items: [...order.items, { ...order.items[0], id: 'i2', product_id: 'p2', is_cancelled: true }],
    } as RestaurantOrder;
    vi.mocked(restaurantApi.getTableActiveOrder).mockResolvedValue(withCancelled);
    const { result } = renderHook(() => useOrderCart('t1'), { wrapper });
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
  });

  it('leaves the local cart alone so a counter sale is not clobbered', async () => {
    const { result } = renderHook(() => useOrderCart('t1'), { wrapper });
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    act(() => result.current.addProduct(product));
    expect(useCartStore.getState().lines).toHaveLength(0);
  });
});

describe('useOrderCart — table mode writes through to the one order', () => {
  it('adding a product appends to the table’s order rather than creating another', async () => {
    const { result } = renderHook(() => useOrderCart('t1'), { wrapper });
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    act(() => result.current.addProduct(product));
    await waitFor(() => expect(restaurantApi.openTableOrder).toHaveBeenCalledWith('t1', [
      { product_id: 'p1', quantity: 1 },
    ]));
  });

  it('changing a quantity updates that order item', async () => {
    const { result } = renderHook(() => useOrderCart('t1'), { wrapper });
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    act(() => result.current.setQuantity('p1', 5));
    await waitFor(() => expect(restaurantApi.updateOrderItem).toHaveBeenCalledWith('o1', 'i1', { quantity: 5 }));
  });

  it('a quantity of zero removes the line — a zero-quantity ticket is not a thing', async () => {
    const { result } = renderHook(() => useOrderCart('t1'), { wrapper });
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    act(() => result.current.setQuantity('p1', 0));
    await waitFor(() => expect(restaurantApi.removeOrderItem).toHaveBeenCalledWith('o1', 'i1'));
    expect(restaurantApi.updateOrderItem).not.toHaveBeenCalled();
  });

  it('removing a line removes that order item', async () => {
    const { result } = renderHook(() => useOrderCart('t1'), { wrapper });
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    act(() => result.current.removeLine('p1'));
    await waitFor(() => expect(restaurantApi.removeOrderItem).toHaveBeenCalledWith('o1', 'i1'));
  });

  it('an unknown product is a no-op rather than an error', async () => {
    const { result } = renderHook(() => useOrderCart('t1'), { wrapper });
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    act(() => result.current.setQuantity('nope', 3));
    expect(restaurantApi.updateOrderItem).not.toHaveBeenCalled();
  });
});
