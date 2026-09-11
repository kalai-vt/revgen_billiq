import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReleaseTableDialog } from '@/features/restaurant/components/ReleaseTableDialog';
import type { TableWithOrder } from '@/features/restaurant/api';

function table(overrides: Partial<TableWithOrder> = {}): TableWithOrder {
  return {
    id: 't1',
    name: '4',
    seats: 4,
    status: 'occupied',
    active_order_id: null,
    active_order_item_count: 0,
    active_order_total: 0,
    kitchen_state: null,
    ...overrides,
  } as unknown as TableWithOrder;
}

function renderDialog(t: TableWithOrder) {
  const onConfirm = vi.fn();
  render(<ReleaseTableDialog table={t} open onOpenChange={vi.fn()} onConfirm={onConfirm} isPending={false} />);
  return { onConfirm, user: userEvent.setup() };
}

describe('ReleaseTableDialog', () => {
  it('reassures that an empty table is only being freed, not deleted', () => {
    renderDialog(table());
    expect(screen.getByText(/no items on it/i)).toBeInTheDocument();
    expect(screen.getByText(/table itself is not\s+deleted/i)).toBeInTheDocument();
  });

  it('releases an empty table without asking to cancel anything', async () => {
    const { onConfirm, user } = renderDialog(table());
    await user.click(screen.getByRole('button', { name: /^release table$/i }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('spells out exactly what is at stake when there is an order', () => {
    renderDialog(table({ active_order_id: 'o1', active_order_item_count: 3, active_order_total: 630 }));
    expect(screen.getByText(/3 items/i)).toBeInTheDocument();
    expect(screen.getByText(/630.00/)).toBeInTheDocument();
    expect(screen.getByText(/cancel that order/i)).toBeInTheDocument();
  });

  it('offers Keep order as the way out, and marks the destructive path', async () => {
    const { onConfirm, user } = renderDialog(
      table({ active_order_id: 'o1', active_order_item_count: 3, active_order_total: 630 }),
    );
    expect(screen.getByRole('button', { name: /keep order/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /release & cancel order/i }));
    // Cancelling the order is explicit — never implied by a plain release.
    expect(onConfirm).toHaveBeenCalledWith(true);
  });
});
