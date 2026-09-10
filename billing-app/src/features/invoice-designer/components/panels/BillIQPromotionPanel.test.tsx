import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BillIQPromotionPanel } from '@/features/invoice-designer/components/panels/BillIQPromotionPanel';
import type { InvoiceTemplateConfig } from '@/features/invoice-designer/api';
import * as invoiceDesignerApi from '@/features/invoice-designer/api';

vi.mock('@/features/invoice-designer/api', async () => {
  const actual = await vi.importActual<typeof invoiceDesignerApi>('@/features/invoice-designer/api');
  return { ...actual, getPromotionConfig: vi.fn() };
});

const baseConfig: InvoiceTemplateConfig = {
  version: 1,
  branding: {
    show_logo: true, show_business_name: true, show_tagline: false, show_address: true, show_phone: true,
    show_email: false, show_website: false, show_gstin: true, show_pan: false, show_fssai: false,
    show_drug_license: false, show_msme_udyam: false, show_social_links: false, social_links_to_show: [], business_name_size: 'md',
  },
  header: { layout: 'logo-left', background_color: null, show_border: true, show_divider: true, border_radius: 0, height_preset: 'normal' },
  invoice_info: {
    fields: {
      invoice_number: true, date: true, time: false, due_date: false, cashier: false, counter: false,
      order_number: false, customer_id: false, payment_method: true, payment_status: false, invoice_status: false,
    },
  },
  customer_details: {
    fields: { name: true, mobile: true, email: false, address: false, gstin: false, loyalty_number: false, membership: false, company_name: false },
  },
  item_table: { columns: [], show_borders: true, alternate_row_colors: true },
  tax_summary: {
    fields: {
      subtotal: true, discount: true, cgst: false, sgst: false, igst: false, cess: false, round_off: false,
      shipping: false, packing: false, grand_total: true, paid: false, outstanding: false, balance: false, amount_in_words: false,
    },
  },
  footer: { sections: [] },
  qr_barcode: { invoice_qr: false, payment_qr: false, business_qr: false, website_qr: false, feedback_qr: false, barcode: false },
  signature: { show_authorized_signature: false, show_customer_signature: false },
  billiq_promotion: {
    enabled: true, layout: 'standard', alignment: 'center', font_size: 'sm', spacing: 'normal',
    separator_line: true, qr_enabled: true, show_description: false,
  },
  theme: {
    primary_color: '#1f2937', secondary_color: '#4b5563', accent_color: '#2563eb', font_family: 'sans',
    font_size: 'md', border_style: 'solid', table_style: 'grid', divider_style: 'solid', corner_radius: 'sm', icon_style: 'outline',
  },
  paper: {
    size: 'A4', custom_width_mm: null, custom_height_mm: null, orientation: 'portrait',
    margin_mm: { top: 18, right: 18, bottom: 18, left: 18 }, logo_size_preset: 'md', font_scale_percent: 100, auto_fit: true,
  },
};

function renderPanel(config: InvoiceTemplateConfig, onChange = vi.fn()) {
  const queryClient = new QueryClient();
  vi.mocked(invoiceDesignerApi.getPromotionConfig).mockResolvedValue({
    version: '1.0', title: 'Powered by RevGenAI BillIQ', description: 'Smart Billing for Business',
    website: 'revgenai.in/billiq', phone: '8680844026', cta_text: 'Try BillIQ today', qr_url: null,
  });
  render(
    <QueryClientProvider client={queryClient}>
      <BillIQPromotionPanel config={config} onChange={onChange} />
    </QueryClientProvider>,
  );
  return { onChange };
}

describe('BillIQPromotionPanel', () => {
  it('shows the layout/alignment/QR controls when enabled', () => {
    renderPanel(baseConfig);
    expect(screen.getByText('Show BillIQ Promotion')).toBeInTheDocument();
    expect(screen.getByText('Layout')).toBeInTheDocument();
    expect(screen.getByText('Alignment')).toBeInTheDocument();
    expect(screen.getByText('QR Code')).toBeInTheDocument();
  });

  it('hides all cosmetic controls when disabled, leaving only the toggle', () => {
    renderPanel({ ...baseConfig, billiq_promotion: { ...baseConfig.billiq_promotion, enabled: false } });
    expect(screen.getByText('Show BillIQ Promotion')).toBeInTheDocument();
    expect(screen.queryByText('Layout')).not.toBeInTheDocument();
    expect(screen.queryByText('QR Code')).not.toBeInTheDocument();
  });

  it('toggling the enable checkbox calls onChange with enabled flipped', () => {
    const { onChange } = renderPanel(baseConfig);
    screen.getByRole('checkbox', { name: /show billiq promotion/i }).click();
    expect(onChange).toHaveBeenCalledTimes(1);
    const updater = onChange.mock.calls[0][0];
    const next = updater(baseConfig);
    expect(next.billiq_promotion.enabled).toBe(false);
    // Every other section of the config is untouched by this panel.
    expect(next.theme).toBe(baseConfig.theme);
    expect(next.qr_barcode).toBe(baseConfig.qr_barcode);
  });

  it("does not expose an editable field for the centrally-managed content itself", () => {
    renderPanel(baseConfig);
    // The read-only preview strip shows the content as text, but there must be no input/textarea
    // a tenant could use to edit RevGenAI's own copy.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('the slogan is off by default and toggling it calls onChange with show_description flipped', async () => {
    const { onChange } = renderPanel(baseConfig);
    const checkbox = await screen.findByRole('checkbox', { name: /show slogan/i });
    expect(checkbox).not.toBeChecked();

    checkbox.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0](baseConfig);
    expect(next.billiq_promotion.show_description).toBe(true);
  });

  it('shows the actual slogan text once content has loaded', async () => {
    renderPanel(baseConfig);
    expect(await screen.findByText(/Show slogan \("Smart Billing for Business"\)/)).toBeInTheDocument();
  });
});
