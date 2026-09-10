import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplatePreview, type BrandingValues } from '@/features/invoice-designer/components/TemplatePreview';
import type { InvoiceTemplateConfig, PromotionContent } from '@/features/invoice-designer/api';
import { buildSamplePreviewData } from '@/features/invoice-designer/lib/sampleData';

const branding: BrandingValues = {
  company_name: 'Acme Retail', phone: '9999999999', email: null, logo_url: null, gst_number: null,
  tagline: null, address_line1: null, address_line2: null, city: null, state: null, pincode: null,
  website: null, pan_number: null, fssai_number: null, drug_license_number: null, msme_udyam_number: null,
  social_links: null, feedback_url: null,
};

const baseConfig: InvoiceTemplateConfig = {
  version: 1,
  branding: {
    show_logo: false, show_business_name: true, show_tagline: false, show_address: false, show_phone: true,
    show_email: false, show_website: false, show_gstin: false, show_pan: false, show_fssai: false,
    show_drug_license: false, show_msme_udyam: false, show_social_links: false, social_links_to_show: [], business_name_size: 'md',
  },
  header: { layout: 'logo-left', background_color: null, show_border: false, show_divider: false, border_radius: 0, height_preset: 'normal' },
  invoice_info: {
    fields: {
      invoice_number: true, date: true, time: false, due_date: false, cashier: false, counter: false,
      order_number: false, customer_id: false, payment_method: false, payment_status: false, invoice_status: false,
    },
  },
  customer_details: {
    fields: { name: false, mobile: false, email: false, address: false, gstin: false, loyalty_number: false, membership: false, company_name: false },
  },
  item_table: { columns: [{ key: 'product', visible: true, order: 0, width: null, align: 'left' }], show_borders: true, alternate_row_colors: true },
  tax_summary: {
    fields: {
      subtotal: false, discount: false, cgst: false, sgst: false, igst: false, cess: false, round_off: false,
      shipping: false, packing: false, grand_total: false, paid: false, outstanding: false, balance: false, amount_in_words: false,
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

const promotionContent: PromotionContent = {
  version: '1.0', title: 'Powered by RevGenAI BillIQ', description: 'Smart Billing for Business',
  website: 'revgenai.in/billiq', phone: '8680844026', cta_text: 'Try BillIQ today', qr_url: null,
};

describe('TemplatePreview — BillIQ Promotion footer', () => {
  it('renders the promotion footer when enabled and content is loaded', () => {
    render(
      <TemplatePreview
        config={baseConfig}
        branding={branding}
        mode="a4"
        data={buildSamplePreviewData('tax_invoice')}
        promotionContent={promotionContent}
      />,
    );
    expect(screen.getByText('Powered by RevGenAI BillIQ')).toBeInTheDocument();
    // Website and phone are always combined onto a single line — a fixed, minimum footprint.
    expect(screen.getByText('revgenai.in/billiq · 8680844026')).toBeInTheDocument();
    expect(screen.queryByText('Smart Billing for Business')).not.toBeInTheDocument();
  });

  it('shows the slogan as an extra line only when show_description is on', () => {
    render(
      <TemplatePreview
        config={{ ...baseConfig, billiq_promotion: { ...baseConfig.billiq_promotion, show_description: true } }}
        branding={branding}
        mode="a4"
        data={buildSamplePreviewData('tax_invoice')}
        promotionContent={promotionContent}
      />,
    );
    expect(screen.getByText('Smart Billing for Business')).toBeInTheDocument();
    expect(screen.getByText('revgenai.in/billiq · 8680844026')).toBeInTheDocument();
  });

  it('renders nothing when billiq_promotion.enabled is false, even with content loaded', () => {
    render(
      <TemplatePreview
        config={{ ...baseConfig, billiq_promotion: { ...baseConfig.billiq_promotion, enabled: false } }}
        branding={branding}
        mode="a4"
        data={buildSamplePreviewData('tax_invoice')}
        promotionContent={promotionContent}
      />,
    );
    expect(screen.queryByText('Powered by RevGenAI BillIQ')).not.toBeInTheDocument();
  });

  it('renders nothing while content is still loading (null), even if enabled', () => {
    render(
      <TemplatePreview
        config={baseConfig}
        branding={branding}
        mode="a4"
        data={buildSamplePreviewData('tax_invoice')}
        promotionContent={null}
      />,
    );
    expect(screen.queryByText('Powered by RevGenAI BillIQ')).not.toBeInTheDocument();
  });

  it('the promotion footer never appears before totals — it always renders after the tax summary section', () => {
    const { container } = render(
      <TemplatePreview
        config={{ ...baseConfig, tax_summary: { fields: { ...baseConfig.tax_summary.fields, grand_total: true } } }}
        branding={branding}
        mode="a4"
        data={buildSamplePreviewData('tax_invoice')}
        promotionContent={promotionContent}
      />,
    );
    const html = container.innerHTML;
    expect(html.indexOf('Grand Total')).toBeLessThan(html.indexOf('Powered by RevGenAI BillIQ'));
  });
});
