import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { SplitOrderDialog } from '@/features/restaurant/components/SplitOrderDialog';
import type { RestaurantOrder } from '@/features/restaurant/api';

vi.mock('@/features/restaurant/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/restaurant/api')>()),
  getLayout: vi.fn().mockResolvedValue([]),
}));

const order = {
  id: 'o1',
  order_number: 'ORD-000012',
  table_id: 't1',
  table_name: '12',
  status: 'open',
  items: [
    { id: 'i1', product_name: 'Masala Dosa', quantity: 3, unit_price: 100, is_cancelled: false, sent_quantity: 3 },
    { id: 'i2', product_name: 'Filter Coffee', quantity: 2, unit_price: 50, is_cancelled: false, sent_quantity: 0 },
    { id: 'i3', product_name: 'Cancelled Idli', quantity: 1, unit_price: 40, is_cancelled: true, sent_quantity: 0 },
  ],
  kots: [],
  totals: { subtotal: 400, tax_amount: 0, total: 400, item_count: 5 },
} as unknown as RestaurantOrder;

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
  wrap(<SplitOrderDialog order={order} open onOpenChange={vi.fn()} onConfirm={onConfirm} isPending={false} />);
  return { onConfirm, user: userEvent.setup() };
}

beforeEach(() => vi.clearAllMocks());

describe('SplitOrderDialog', () => {
  it('offers only the items still on the order, not cancelled ones', () => {
    renderDialog();
    expect(screen.getByText('Masala Dosa')).toBeInTheDocument();
    expect(screen.getByText('Filter Coffee')).toBeInTheDocument();
    expect(screen.queryByText('Cancelled Idli')).not.toBeInTheDocument();
  });

  // base-ui renders a Select's raw value unless given a mapper, so the takeaway sentinel leaked
  // to the screen verbatim until this was caught in the browser.
  it('names the destination in words rather than showing the takeaway sentinel', () => {
    renderDialog();
    expect(screen.getByText('No table (takeaway)')).toBeInTheDocument();
    expect(screen.queryByText('__takeaway__')).not.toBeInTheDocument();
  });

  it('cannot split until something is actually picked', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /split off/i })).toBeDisabled();
  });

  it('totals only what is moving, not the whole bill', async () => {
    const { user } = renderDialog();
    await user.click(screen.getByRole('button', { name: /move one more Masala Dosa/i }));
    await user.click(screen.getByRole('button', { name: /move one more Masala Dosa/i }));
    // 2 × 100 — the untouched coffee stays on the original bill.
    expect(screen.getByText('200.00')).toBeInTheDocument();
  });

  it('never lets a guest be charged for more than was ordered', async () => {
    const { user } = renderDialog();
    const plus = screen.getByRole('button', { name: /move one more Filter Coffee/i });
    await user.click(plus);
    await user.click(plus);
    expect(plus).toBeDisabled();
  });

  it('blocks moving the entire order, which is a table transfer and not a split', async () => {
    const { user } = renderDialog();
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: /move one more Masala Dosa/i }));
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole('button', { name: /move one more Filter Coffee/i }));
    expect(screen.getByText(/use Move table instead/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /split off/i })).toBeDisabled();
  });

  it('splits the picked quantities onto a takeaway bill by default', async () => {
    const { onConfirm, user } = renderDialog();
    await user.click(screen.getByRole('button', { name: /move one more Masala Dosa/i }));
    await user.click(screen.getByRole('button', { name: /split off/i }));
    expect(onConfirm).toHaveBeenCalledWith({ items: [{ order_item_id: 'i1', quantity: 1 }], toTableId: null });
  });
});
