import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BillOrderDialog } from '@/features/restaurant/components/BillOrderDialog';
import type { RestaurantOrder } from '@/features/restaurant/api';

const order = {
  id: 'o1',
  order_number: 'ORD-000012',
  table_name: '12',
  table_id: 't1',
  status: 'open',
  items: [],
  kots: [],
  totals: { subtotal: 1000, tax_amount: 0, total: 1000, item_count: 2 },
} as unknown as RestaurantOrder;

function renderDialog() {
  const onConfirm = vi.fn();
  render(
    <BillOrderDialog order={order} open onOpenChange={vi.fn()} onConfirm={onConfirm} isPending={false} />,
  );
  return { onConfirm };
}

describe('BillOrderDialog', () => {
  it('shows the order total as payable when no discount is applied', () => {
    renderDialog();
    expect(screen.getByText('Payable')).toBeInTheDocument();
    expect(screen.getAllByText('1000.00').length).toBeGreaterThan(0);
  });

  it('defaults to marking the bill paid, the ordinary settle-now case', () => {
    renderDialog();
    expect(screen.getByRole('checkbox', { name: /payment received/i })).toBeChecked();
  });

  it('bills with the chosen payment method and paid flag', () => {
    const { onConfirm } = renderDialog();
    screen.getByRole('button', { name: /bill & close table/i }).click();
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: 'cash', mark_paid: true, discount_value: 0 }),
    );
  });

  it('explains that an unpaid bill goes to Outstanding rather than vanishing', () => {
    renderDialog();
    screen.getByRole('checkbox', { name: /payment received/i }).click();
    expect(screen.getByText(/Outstanding for collection later/)).toBeInTheDocument();
  });
});
