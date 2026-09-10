import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { MergeOrdersDialog } from '@/features/restaurant/components/MergeOrdersDialog';
import * as restaurantApi from '@/features/restaurant/api';
import type { RestaurantOrder } from '@/features/restaurant/api';

vi.mock('@/features/restaurant/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/restaurant/api')>()),
  listOrders: vi.fn(),
}));

function makeOrder(overrides: Partial<RestaurantOrder>): RestaurantOrder {
  return {
    id: 'o1',
    order_number: 'ORD-000012',
    table_id: 't1',
    table_name: '12',
    status: 'open',
    items: [],
    kots: [],
    totals: { subtotal: 0, tax_amount: 0, total: 0, item_count: 0 },
    ...overrides,
  } as unknown as RestaurantOrder;
}

const target = makeOrder({});

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

function renderDialog() {
  const onConfirm = vi.fn();
  wrap(<MergeOrdersDialog order={target} open onOpenChange={vi.fn()} onConfirm={onConfirm} isPending={false} />);
  return { onConfirm, user: userEvent.setup() };
}

beforeEach(() => vi.clearAllMocks());

describe('MergeOrdersDialog', () => {
  it('never offers this order as something to merge into itself', async () => {
    vi.mocked(restaurantApi.listOrders).mockResolvedValue([
      target,
      makeOrder({ id: 'o2', order_number: 'ORD-000013', table_id: 't2', table_name: '13' }),
    ]);
    renderDialog();
    await screen.findByText('ORD-000013');
    expect(screen.queryByText('ORD-000012')).not.toBeInTheDocument();
  });

  it('says so plainly when there is nothing else running', async () => {
    vi.mocked(restaurantApi.listOrders).mockResolvedValue([target]);
    renderDialog();
    expect(await screen.findByText(/no other open order to merge/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /merge/i })).toBeDisabled();
  });

  it('merges every order the user ticked, not just the last one', async () => {
    vi.mocked(restaurantApi.listOrders).mockResolvedValue([
      target,
      makeOrder({ id: 'o2', order_number: 'ORD-000013', table_id: 't2', table_name: '13' }),
      makeOrder({ id: 'o3', order_number: 'ORD-000014', table_id: null, table_name: null, order_type: 'takeaway' }),
    ]);
    const { onConfirm, user } = renderDialog();
    await screen.findByText('ORD-000013');
    const boxes = screen.getAllByRole('checkbox');
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    await user.click(screen.getByRole('button', { name: /merge 2 orders/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(['o2', 'o3']));
  });

  it('warns that the merged-away tables are closed for good', async () => {
    vi.mocked(restaurantApi.listOrders).mockResolvedValue([
      target,
      makeOrder({ id: 'o2', order_number: 'ORD-000013', table_id: 't2', table_name: '13' }),
    ]);
    renderDialog();
    expect(await screen.findByText(/cannot be undone/i)).toBeInTheDocument();
  });
});
