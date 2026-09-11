import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CheckoutPanel } from '@/features/pos/components/CheckoutPanel';
import { DEFAULT_CHECKOUT_CONFIG, type CheckoutElementKey } from '@/features/pos/lib/checkoutElements';
import type { CartLine } from '@/features/pos/hooks/useCart';
import type { Product } from '@/features/products/api';

const product: Product = {
  id: 'prod-1',
  tenant_id: 'tenant-1',
  name: 'Widget',
  identifier_type: 'pid',
  identifier_label: null,
  identifier_value: 'WID-1',
  barcode: null,
  category_id: null,
  category_name: null,
  description: null,
  cost_price: 10,
  selling_price: 100,
  tax_rate_percent: 2.5,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  additional_identifiers: [],
};

const lines: CartLine[] = [{ product, quantity: 1, overridePrice: null }];

const baseProps = {
  lines,
  discountType: null,
  discountValue: 0,
  onDiscountChange: vi.fn(),
  taxPercentage: 2.5,
  onTaxPercentageChange: vi.fn(),
  paymentMethod: 'cash' as const,
  onPaymentMethodChange: vi.fn(),
  paymentType: 'paid' as const,
  onPaymentTypeChange: vi.fn(),
  outstandingEnabled: false,
  paymentReference: '',
  onPaymentReferenceChange: vi.fn(),
  tableId: '__no_table__',
  onTableIdChange: vi.fn(),
  isTableMode: false,
  onPrintKot: vi.fn(),
  isPrintingKot: false,
  amountTendered: null,
  onAmountTenderedChange: vi.fn(),
  paidNow: null,
  onPaidNowChange: vi.fn(),
  dueDate: '',
  onDueDateChange: vi.fn(),
  customerName: '',
  onCustomerNameChange: vi.fn(),
  customerPhone: '',
  onCustomerPhoneChange: vi.fn(),
  totals: { subtotal: 100, discountAmount: 0, taxableAmount: 100, taxAmount: 2.5, total: 102.5, effectiveTaxPercentage: 2.5 },
  onCheckout: vi.fn(),
  isSubmitting: false,
  error: null,
  onHold: vi.fn(),
  isHolding: false,
  onPrintOrderBill: vi.fn(),
  allowDiscounts: true,
  enableCustomerSelection: false,
  customerId: null,
  selectedCustomer: null,
  onCustomerSelect: vi.fn(),
  checkoutConfig: DEFAULT_CHECKOUT_CONFIG,
};

function configWith(overrides: Partial<Record<CheckoutElementKey, boolean>>) {
  return { ...DEFAULT_CHECKOUT_CONFIG, ...overrides };
}

/** CheckoutPanel reads `invoice_designer` through TanStack Query, so every render of it needs a
 * QueryClient in context. Wrapping here instead of at each call site is what keeps a newly added
 * test from failing on a missing provider — which is exactly how this file ended up with two
 * hand-wrapped tests and the rest broken.
 *
 * `wrapper` (rather than wrapping the element) is deliberate: RTL re-applies it on `rerender`,
 * so the toggle tests below keep their provider across the second render too.
 */
function render(ui: ReactElement) {
  // No retries and no network: the flag query has no server here, and every flag defaults to
  // enabled when absent (see useFeatureFlag), which is the state these tests assume.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe('CheckoutPanel — canCheckout', () => {
  it('the default paid + cash combo is checkout-ready with amount tendered left blank', () => {
    render(<CheckoutPanel {...baseProps} />);
    const button = screen.getByRole('button', { name: /checkout/i });
    expect(button).not.toBeDisabled();
  });

  it('an empty cart still blocks checkout regardless of amount tendered', () => {
    render(<CheckoutPanel {...baseProps} lines={[]} totals={{ ...baseProps.totals, subtotal: 0, taxAmount: 0, total: 0 }} />);
    const button = screen.getByRole('button', { name: /checkout/i });
    expect(button).toBeDisabled();
  });

  it('a partial/credit sale with the Outstanding module on still requires a customer', () => {
    render(<CheckoutPanel {...baseProps} outstandingEnabled paymentType="credit" />);
    const button = screen.getByRole('button', { name: /checkout/i });
    expect(button).toBeDisabled();
  });
});

describe('CheckoutPanel — Total and Checkout are always visible', () => {
  it('Total and the Checkout button render even with every optional element disabled', () => {
    const allOff = configWith({
      customer: false,
      phone: false,
      discount: false,
      tax: false,
      partially_paid: false,
      credit: false,
      card: false,
      upi: false,
      amount_tendered: false,
      change_due: false,
      hold_bill: false,
    });
    render(<CheckoutPanel {...baseProps} checkoutConfig={allOff} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /checkout/i })).toBeInTheDocument();
  });
});

describe('CheckoutPanel — each element disappears completely when disabled', () => {
  it('Discount: input and summary tile both hide when off, both show when on', () => {
    const { rerender } = render(<CheckoutPanel {...baseProps} checkoutConfig={configWith({ discount: false })} />);
    expect(screen.queryByText('Discount')).not.toBeInTheDocument();

    rerender(<CheckoutPanel {...baseProps} checkoutConfig={configWith({ discount: true })} />);
    expect(screen.getByText('Discount')).toBeInTheDocument();
  });

  it('Discount also respects the pre-existing allowDiscounts business preference (AND, not OR)', () => {
    render(<CheckoutPanel {...baseProps} allowDiscounts={false} checkoutConfig={configWith({ discount: true })} />);
    expect(screen.queryByText('Discount')).not.toBeInTheDocument();
  });

  it('Tax: input and summary tile both hide when off', () => {
    render(<CheckoutPanel {...baseProps} checkoutConfig={configWith({ tax: false })} />);
    expect(screen.queryByText('Tax %')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Tax \(/)).not.toBeInTheDocument();
  });

  it('Customer and Phone (walk-in fields) hide independently of each other', () => {
    const { rerender } = render(<CheckoutPanel {...baseProps} checkoutConfig={configWith({ customer: false })} />);
    expect(screen.queryByPlaceholderText('Walk-in Customer')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Phone (optional)')).toBeInTheDocument();

    rerender(<CheckoutPanel {...baseProps} checkoutConfig={configWith({ phone: false })} />);
    expect(screen.getByPlaceholderText('Walk-in Customer')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Phone (optional)')).not.toBeInTheDocument();
  });

  it('the customer picker still renders for a required credit sale even if the Customer element is off', () => {
    render(
      <CheckoutPanel
        {...baseProps}
        outstandingEnabled
        paymentType="credit"
        checkoutConfig={configWith({ customer: false, phone: false })}
      />,
    );
    // The walk-in-only fields are absent, but a customer must still be selectable — hiding a UI
    // element must never break the business requirement that credit sales need a customer.
    expect(screen.queryByPlaceholderText('Walk-in Customer')).not.toBeInTheDocument();
    expect(screen.getByText(/customer must be selected/i)).toBeInTheDocument();
  });

  it('Cash/Card/UPI payment methods hide independently', () => {
    render(<CheckoutPanel {...baseProps} checkoutConfig={configWith({ card: false, upi: false })} />);
    expect(screen.getByRole('button', { name: 'Cash' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Card' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'UPI' })).not.toBeInTheDocument();
  });

  it('Paid in Full / Partially Paid / Credit hide independently when Outstanding is enabled', () => {
    render(
      <CheckoutPanel {...baseProps} outstandingEnabled checkoutConfig={configWith({ credit: false })} />,
    );
    expect(screen.getByRole('button', { name: 'Paid in Full' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partially Paid' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Credit (Pay Later)' })).not.toBeInTheDocument();
  });

  it('Partially Paid and Credit stay hidden when Outstanding module is off, even if their settings are on', () => {
    render(<CheckoutPanel {...baseProps} outstandingEnabled={false} checkoutConfig={configWith({})} />);
    expect(screen.queryByRole('button', { name: 'Partially Paid' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Credit (Pay Later)' })).not.toBeInTheDocument();
  });

  it('Amount Tendered and Change Due hide independently', () => {
    const { rerender } = render(<CheckoutPanel {...baseProps} checkoutConfig={configWith({ amount_tendered: false })} />);
    expect(screen.queryByLabelText('Amount Tendered')).not.toBeInTheDocument();
    expect(screen.getByText('Change Due')).toBeInTheDocument();

    rerender(<CheckoutPanel {...baseProps} checkoutConfig={configWith({ change_due: false })} />);
    expect(screen.getByLabelText('Amount Tendered')).toBeInTheDocument();
    expect(screen.queryByText('Change Due')).not.toBeInTheDocument();
  });

  it('the whole cashier-tools box disappears (no empty space) when both are off', () => {
    render(<CheckoutPanel {...baseProps} checkoutConfig={configWith({ amount_tendered: false, change_due: false })} />);
    expect(screen.queryByLabelText('Amount Tendered')).not.toBeInTheDocument();
    expect(screen.queryByText('Change Due')).not.toBeInTheDocument();
  });

  it('Hold Bill button hides when off, leaving only Checkout', () => {
    render(<CheckoutPanel {...baseProps} checkoutConfig={configWith({ hold_bill: false })} />);
    expect(screen.queryByRole('button', { name: /hold bill/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /checkout/i })).toBeInTheDocument();
  });
});

describe('CheckoutPanel — Billing Summary (Sale Amount / Discount / Tax / Total)', () => {
  const summaryTotals = { subtotal: 1000, discountAmount: 100, taxableAmount: 900, taxAmount: 45, total: 945, effectiveTaxPercentage: 5 };

  it('Sale Amount always renders, regardless of Discount/Tax toggles', () => {
    render(
      <CheckoutPanel
        {...baseProps}
        totals={summaryTotals}
        checkoutConfig={configWith({ discount: false, tax: false })}
      />,
    );
    expect(screen.getByText('Sale Amount')).toBeInTheDocument();
    expect(screen.getByText('₹1000.00')).toBeInTheDocument();
  });

  it('Discount renders with a leading minus sign and Tax with a leading plus sign', () => {
    render(<CheckoutPanel {...baseProps} totals={summaryTotals} checkoutConfig={configWith({ discount: true, tax: true })} />);
    expect(screen.getByText('-₹100.00')).toBeInTheDocument();
    expect(screen.getByText('+₹45.00')).toBeInTheDocument();
  });

  it('Total equals Sale Amount - Discount + Tax and matches the Checkout button amount', () => {
    render(<CheckoutPanel {...baseProps} totals={summaryTotals} checkoutConfig={configWith({ discount: true, tax: true })} />);
    // 1000 - 100 + 45 = 945, matching the totals object computed upstream by calc.ts.
    expect(screen.getAllByText('₹945.00').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /checkout · ₹945\.00/i })).toBeInTheDocument();
  });
});

describe('CheckoutPanel — Print Order Bill', () => {
  it('renders a Print Order Bill action distinct from Checkout, calling only its own handler', () => {
    const onPrintOrderBill = vi.fn();
    render(<CheckoutPanel {...baseProps} onPrintOrderBill={onPrintOrderBill} />);
    const printButton = screen.getByRole('button', { name: /print order bill/i });
    printButton.click();
    expect(onPrintOrderBill).toHaveBeenCalledTimes(1);
    expect(baseProps.onCheckout).not.toHaveBeenCalled();
  });

  it('Print Order Bill is disabled for an empty cart, same as Checkout', () => {
    render(<CheckoutPanel {...baseProps} lines={[]} totals={{ ...baseProps.totals, subtotal: 0, taxAmount: 0, total: 0 }} />);
    expect(screen.getByRole('button', { name: /print order bill/i })).toBeDisabled();
  });
});

describe('CheckoutPanel — payment reference', () => {
  it('is offered for UPI, where there is a transaction id to record', () => {
    render(<CheckoutPanel {...baseProps} paymentMethod="upi" />);
    expect(screen.getByLabelText(/UPI Txn ID/i)).toBeInTheDocument();
  });

  it('is offered for card as an approval code', () => {
    render(<CheckoutPanel {...baseProps} paymentMethod="card" />);
    expect(screen.getByLabelText(/Approval Code/i)).toBeInTheDocument();
  });

  it('is not offered for cash, which has no transaction id', () => {
    render(<CheckoutPanel {...baseProps} paymentMethod="cash" />);
    expect(screen.queryByLabelText(/Txn ID|Approval Code/i)).not.toBeInTheDocument();
  });

  it('is not offered on a credit sale — nothing has been paid yet to reference', () => {
    render(<CheckoutPanel {...baseProps} paymentMethod="upi" paymentType="credit" outstandingEnabled />);
    expect(screen.queryByLabelText(/Txn ID/i)).not.toBeInTheDocument();
  });

  it('disappears when the tenant turns the element off', () => {
    render(<CheckoutPanel {...baseProps} paymentMethod="upi" checkoutConfig={configWith({ payment_reference: false })} />);
    expect(screen.queryByLabelText(/Txn ID/i)).not.toBeInTheDocument();
  });

  it('reports what the cashier typed', async () => {
    const onPaymentReferenceChange = vi.fn();
    render(
      <CheckoutPanel {...baseProps} paymentMethod="upi" onPaymentReferenceChange={onPaymentReferenceChange} />,
    );
    await userEvent.type(screen.getByLabelText(/UPI Txn ID/i), '44');
    expect(onPaymentReferenceChange).toHaveBeenCalled();
  });
});

describe('CheckoutPanel — Print Kitchen KOT', () => {
  it('is offered next to Print Order Bill', () => {
    render(<CheckoutPanel {...baseProps} />);
    expect(screen.getByRole('button', { name: /print kitchen kot/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print order bill/i })).toBeInTheDocument();
  });

  it('will not send a ticket with no table — the kitchen could not deliver it', () => {
    render(<CheckoutPanel {...baseProps} tableId="__no_table__" />);
    expect(screen.getByRole('button', { name: /print kitchen kot/i })).toBeDisabled();
  });

  it('sends once a table is picked', async () => {
    const onPrintKot = vi.fn();
    render(<CheckoutPanel {...baseProps} tableId="t1" onPrintKot={onPrintKot} />);
    const button = screen.getByRole('button', { name: /print kitchen kot/i });
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    expect(onPrintKot).toHaveBeenCalled();
  });

  it('disappears when the tenant turns the element off', () => {
    render(<CheckoutPanel {...baseProps} checkoutConfig={configWith({ print_kot: false })} />);
    expect(screen.queryByRole('button', { name: /print kitchen kot/i })).not.toBeInTheDocument();
  });

  it('Print Order Bill is now toggleable too', () => {
    render(<CheckoutPanel {...baseProps} checkoutConfig={configWith({ print_order_bill: false })} />);
    expect(screen.queryByRole('button', { name: /print order bill/i })).not.toBeInTheDocument();
  });
});

describe('CheckoutPanel — Hold Bill', () => {
  it('is offered for a counter sale, which has nowhere else to keep the cart', () => {
    render(<CheckoutPanel {...baseProps} />);
    expect(screen.getByRole('button', { name: /hold bill/i })).toBeInTheDocument();
  });

  it('is withdrawn in table mode — the table already holds the order', () => {
    // Offering it here produced a duplicate held bill and emptied the table's order, leaving the
    // table occupied with nothing on it.
    render(<CheckoutPanel {...baseProps} tableId="t1" isTableMode />);
    expect(screen.queryByRole('button', { name: /hold bill/i })).not.toBeInTheDocument();
  });
});
