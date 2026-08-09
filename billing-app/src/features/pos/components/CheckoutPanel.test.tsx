import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CheckoutPanel } from '@/features/pos/components/CheckoutPanel';
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
};

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
