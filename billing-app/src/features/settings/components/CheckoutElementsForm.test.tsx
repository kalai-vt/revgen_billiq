import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CheckoutElementsForm } from '@/features/settings/components/CheckoutElementsForm';
import * as settingsApi from '@/features/settings/api';

const catalog = {
  groups: { customer_info: 'Customer Info', pricing: 'Pricing', payment_type: 'Payment Type' },
  elements: [
    { key: 'customer', label: 'Customer', group: 'customer_info', depends_on_module: null },
    { key: 'phone', label: 'Phone', group: 'customer_info', depends_on_module: null },
    { key: 'discount', label: 'Discount', group: 'pricing', depends_on_module: null },
    { key: 'partially_paid', label: 'Partially Paid', group: 'payment_type', depends_on_module: 'payments_credit' },
  ],
};

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CheckoutElementsForm />
    </QueryClientProvider>,
  );
}

describe('CheckoutElementsForm', () => {
  it('loads the catalog and current config, rendering a checkbox per element grouped by section', async () => {
    vi.spyOn(settingsApi, 'getCheckoutElementCatalog').mockResolvedValue(catalog);
    vi.spyOn(settingsApi, 'getCheckoutConfig').mockResolvedValue({
      config: { customer: true, phone: false, discount: true, partially_paid: true },
    });

    renderForm();

    expect(await screen.findByText('Customer Info')).toBeInTheDocument();
    expect(screen.getByText('Pricing')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer')).toBeChecked();
    expect(screen.getByLabelText('Phone')).not.toBeChecked();
    expect(screen.getByLabelText('Discount')).toBeChecked();
  });

  it('flags Outstanding-dependent elements so the admin understands why they might not show', async () => {
    vi.spyOn(settingsApi, 'getCheckoutElementCatalog').mockResolvedValue(catalog);
    vi.spyOn(settingsApi, 'getCheckoutConfig').mockResolvedValue({
      config: { customer: true, phone: true, discount: true, partially_paid: true },
    });

    renderForm();

    expect(await screen.findByText('Needs Outstanding')).toBeInTheDocument();
  });

  it('toggling a checkbox and saving sends the full updated config to the API', async () => {
    vi.spyOn(settingsApi, 'getCheckoutElementCatalog').mockResolvedValue(catalog);
    vi.spyOn(settingsApi, 'getCheckoutConfig').mockResolvedValue({
      config: { customer: true, phone: true, discount: true, partially_paid: true },
    });
    const updateSpy = vi
      .spyOn(settingsApi, 'updateCheckoutConfig')
      .mockResolvedValue({ config: { customer: true, phone: false, discount: true, partially_paid: true } });

    const user = userEvent.setup();
    renderForm();

    const phoneCheckbox = await screen.findByLabelText('Phone');
    expect(phoneCheckbox).toBeChecked();
    await user.click(phoneCheckbox);
    expect(phoneCheckbox).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ customer: true, phone: false, discount: true, partially_paid: true }),
      );
    });
  });
});
