import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentQrPanel } from '@/features/invoice-designer/components/panels/PaymentQrPanel';
import type { InvoiceTemplateConfig } from '@/features/invoice-designer/api';
import * as settingsApi from '@/features/settings/api';

vi.mock('@/features/settings/api', async () => {
  const actual = await vi.importActual<typeof settingsApi>('@/features/settings/api');
  return { ...actual, getSettings: vi.fn() };
});

const paymentQr: InvoiceTemplateConfig['payment_qr'] = {
  enabled: true,
  label: 'Scan to Pay',
  position: 'footer',
  size: 'md',
  show_amount: true,
  show_upi_id: false,
  show_payment_status: true,
  visibility: 'unpaid_only',
};

const baseConfig = {
  payment_qr: paymentQr,
  qr_barcode: { invoice_qr: false, payment_qr: false, business_qr: false, website_qr: false, feedback_qr: false, barcode: false },
} as unknown as InvoiceTemplateConfig;

function renderPanel(config: InvoiceTemplateConfig, upiVpa: string | null = 'business@upi') {
  const onChange = vi.fn();
  vi.mocked(settingsApi.getSettings).mockResolvedValue({ upi_vpa: upiVpa } as never);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PaymentQrPanel config={config} onChange={onChange} />
    </QueryClientProvider>,
  );
  return { onChange };
}

describe('PaymentQrPanel', () => {
  it('exposes the element controls when enabled', () => {
    renderPanel(baseConfig);
    expect(screen.getByText('Show Payment QR Code')).toBeInTheDocument();
    expect(screen.getByText('Label')).toBeInTheDocument();
    expect(screen.getByText('Position')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('Show amount')).toBeInTheDocument();
    expect(screen.getByText('Show UPI ID')).toBeInTheDocument();
    expect(screen.getByText('Show payment status')).toBeInTheDocument();
  });

  it('collapses to just the toggle when the element is off', () => {
    renderPanel({ ...baseConfig, payment_qr: { ...paymentQr, enabled: false } } as InvoiceTemplateConfig);
    expect(screen.getByText('Show Payment QR Code')).toBeInTheDocument();
    expect(screen.queryByText('Position')).not.toBeInTheDocument();
  });

  it('warns when no UPI ID is configured, since the QR would be left off entirely', async () => {
    renderPanel(baseConfig, null);
    expect(await screen.findByText(/Add your UPI ID/)).toBeInTheDocument();
  });

  it('does not warn once a UPI ID exists', async () => {
    renderPanel(baseConfig, 'business@upi');
    // The warning renders on the first pass (settings haven't loaded yet) and must clear once
    // they arrive — so this waits for its removal rather than sampling too early.
    await waitFor(() => expect(screen.queryByText(/Add your UPI ID/)).not.toBeInTheDocument());
  });

  it('toggling the element only touches payment_qr, never other sections', () => {
    const { onChange } = renderPanel(baseConfig);
    screen.getByRole('checkbox', { name: /show payment qr code/i }).click();
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0](baseConfig);
    expect(next.payment_qr.enabled).toBe(false);
    expect(next.qr_barcode).toBe(baseConfig.qr_barcode);
  });
});
