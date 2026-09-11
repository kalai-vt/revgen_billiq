import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeTableDialog } from '@/features/pos/components/ChangeTableDialog';

function renderDialog(itemCount = 3) {
  const onKeepCurrent = vi.fn();
  const onMove = vi.fn();
  render(
    <ChangeTableDialog
      open
      itemCount={itemCount}
      isPending={false}
      onOpenChange={vi.fn()}
      onKeepCurrent={onKeepCurrent}
      onMove={onMove}
    />,
  );
  return { onKeepCurrent, onMove, user: userEvent.setup() };
}

describe('ChangeTableDialog', () => {
  it('says how much is on the order, so the choice is informed', () => {
    renderDialog(3);
    expect(screen.getByText(/3 items/i)).toBeInTheDocument();
  });

  it('offers both answers rather than guessing — either one loses an order if assumed', async () => {
    const { onKeepCurrent, onMove, user } = renderDialog();
    await user.click(screen.getByRole('button', { name: /keep current table/i }));
    expect(onKeepCurrent).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /move order to new table/i }));
    expect(onMove).toHaveBeenCalled();
  });

  it('reads correctly for a single item', () => {
    renderDialog(1);
    expect(screen.getByText(/1 item\b/i)).toBeInTheDocument();
  });
});
