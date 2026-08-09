import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <CheckoutPanel {...baseProps} outstandingEnabled paymentType="credit" />
      </QueryClientProvider>,
    );
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
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <CheckoutPanel
          {...baseProps}
          outstandingEnabled
          paymentType="credit"
          checkoutConfig={configWith({ customer: false, phone: false })}
        />
      </QueryClientProvider>,
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
