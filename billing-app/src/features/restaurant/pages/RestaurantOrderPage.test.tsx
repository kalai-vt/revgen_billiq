import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RestaurantOrderPage } from '@/features/restaurant/pages/RestaurantOrderPage';
import * as restaurantApi from '@/features/restaurant/api';
import * as settingsApi from '@/features/settings/api';
import type { RestaurantOrder } from '@/features/restaurant/api';

vi.mock('@/features/restaurant/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/restaurant/api')>()),
  getOrder: vi.fn(),
  listOrders: vi.fn().mockResolvedValue([]),
  getLayout: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/settings/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/settings/api')>()),
  getFeatureFlags: vi.fn(),
}));
vi.mock('@/features/pos/components/ProductSearchPanel', () => ({ ProductSearchPanel: () => null }));

const order = {
  id: 'o1',
  order_number: 'ORD-000012',
  order_type: 'dine_in',
  status: 'open',
  table_id: 't1',
  table_name: '12',
  items: [
    { id: 'i1', product_name: 'Dosa', quantity: 2, sent_quantity: 0, unit_price: 100, is_cancelled: false, line_total: 200 },
  ],
  kots: [],
  totals: { subtotal: 200, tax_amount: 0, total: 200, item_count: 2 },
} as unknown as RestaurantOrder;

/** Every restaurant sub-feature is separately enableable per tenant, so "on" here means the
 * flag map says nothing — absent reads as enabled, same as every other module. */
async function renderPage(flags: Record<string, boolean>) {
  vi.mocked(restaurantApi.getOrder).mockResolvedValue(order);
  vi.mocked(settingsApi.getFeatureFlags).mockResolvedValue(flags as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/restaurant/orders/o1']}>
        <Routes>
          <Route path="/restaurant/orders/:id" element={<RestaurantOrderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText('ORD-000012');
}

beforeEach(() => vi.clearAllMocks());

describe('RestaurantOrderPage — per-tenant feature gating', () => {
  it('offers every table action when the modules are on', async () => {
    await renderPage({});
    expect(screen.getByRole('button', { name: /send to kitchen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /move to another table/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^merge$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^split$/i })).toBeInTheDocument();
  });

  it('hides an action whose module is off rather than offering a call that would 402', async () => {
    await renderPage({ kot: false, table_transfer: false, table_merge: false, table_split: false });
    expect(screen.queryByRole('button', { name: /send to kitchen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /move to another table/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^merge$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^split$/i })).not.toBeInTheDocument();
    // The kitchen-ticket panel is meaningless without KOT.
    expect(screen.queryByText(/kitchen tickets/i)).not.toBeInTheDocument();
  });

  it('gates each module independently — turning one off leaves the others alone', async () => {
    await renderPage({ table_merge: false });
    expect(screen.queryByRole('button', { name: /^merge$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^split$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send to kitchen/i })).toBeInTheDocument();
  });

  it('always allows billing — a table that cannot be billed is not a usable restaurant', async () => {
    await renderPage({ kot: false, table_transfer: false, table_merge: false, table_split: false });
    expect(screen.getByRole('button', { name: /bill & close table/i })).toBeInTheDocument();
  });
});
