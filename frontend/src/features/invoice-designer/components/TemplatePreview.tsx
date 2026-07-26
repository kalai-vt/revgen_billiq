import type { CSSProperties } from 'react';
import type { InvoiceTemplateConfig, PreviewData } from '@/features/invoice-designer/api';
import { cn } from '@/lib/utils';

export type PreviewMode = 'desktop' | 'a4' | 'a5' | '80mm' | '58mm' | 'mobile' | 'pdf';

export const PREVIEW_MODES: { value: PreviewMode; label: string }[] = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'a4', label: 'A4' },
  { value: 'a5', label: 'A5' },
  { value: '80mm', label: '80mm Thermal' },
  { value: '58mm', label: '58mm Thermal' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'pdf', label: 'PDF' },
];

/** Maps a template's configured paper size to the closest preview mode, so print pages/receipts
 * render at the size the tenant actually chose instead of a fixed default. */
export function paperSizeToPreviewMode(size: InvoiceTemplateConfig['paper']['size']): PreviewMode {
  if (size === '58mm' || size === '80mm' || size === 'A5') return size === 'A5' ? 'a5' : size;
  return 'a4';
}

const MODE_WIDTH_PX: Record<PreviewMode, number | null> = {
  desktop: null,
  a4: 794,
  a5: 559,
  '80mm': 302,
  '58mm': 219,
  mobile: 375,
  pdf: 794,
};

export interface BrandingValues {
  company_name: string;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  gst_number: string | null;
  tagline: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  website: string | null;
  pan_number: string | null;
  fssai_number: string | null;
  drug_license_number: string | null;
  msme_udyam_number: string | null;
  social_links: Record<string, string> | null;
  feedback_url: string | null;
}

interface TemplatePreviewProps {
  config: InvoiceTemplateConfig;
  branding: BrandingValues;
  mode: PreviewMode;
  data: PreviewData;
}

const FONT_FAMILY_CSS: Record<InvoiceTemplateConfig['theme']['font_family'], string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, serif',
  mono: 'ui-monospace, SFMono-Regular, monospace',
};

const FONT_SIZE_PX: Record<InvoiceTemplateConfig['theme']['font_size'], number> = {
  sm: 11, md: 12.5, lg: 14,
};

function addressLine(branding: BrandingValues): string | null {
  const parts = [branding.address_line1, branding.address_line2, [branding.city, branding.state].filter(Boolean).join(', '), branding.pincode]
    .filter((part) => part && part.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
}

function QrPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="grid size-14 grid-cols-4 grid-rows-4 gap-px border p-1"
        style={{ borderColor: 'currentColor' }}
        aria-hidden
      >
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className={cn((i * 7) % 3 === 0 ? 'bg-current' : 'bg-transparent')} />
        ))}
      </div>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}

function BarcodePlaceholder() {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-10 items-end gap-px" aria-hidden>
        {Array.from({ length: 28 }).map((_, i) => (
          <div key={i} className="bg-current" style={{ width: (i % 5 === 0 ? 2 : 1), height: `${40 + ((i * 13) % 60)}%` }} />
        ))}
      </div>
      <span className="text-[9px] text-muted-foreground">Barcode</span>
    </div>
  );
}

export function TemplatePreview({ config, branding, mode, data }: TemplatePreviewProps) {
  const width = MODE_WIDTH_PX[mode];
  const isThermal = mode === '80mm' || mode === '58mm';
  const theme = config.theme;
  const paper = config.paper;
  const address = addressLine(branding);
  const visibleColumns = [...config.item_table.columns].filter((c) => c.visible).sort((a, b) => a.order - b.order);
  const footerSections = [...config.footer.sections].filter((s) => s.enabled).sort((a, b) => a.order - b.order);

  const paddingPx = isThermal ? 10 : mode === 'mobile' ? 14 : Math.min(48, Math.max(12, paper.margin_mm.top * 3.0));
  const fontScale = isThermal ? paper.font_scale_percent / 100 : 1;

  const rootStyle: CSSProperties = {
    width: width ?? undefined,
    maxWidth: '100%',
    margin: width ? '0 auto' : undefined,
    fontFamily: FONT_FAMILY_CSS[theme.font_family],
    fontSize: FONT_SIZE_PX[theme.font_size] * fontScale,
    color: '#1a1a1a',
    padding: paddingPx,
    background: '#ffffff',
  };

  const dividerBorder = `1px ${theme.divider_style} ${theme.secondary_color}33`;

  return (
    <div
      className={cn('rounded-md border shadow-sm', mode === 'pdf' && 'ring-1 ring-foreground/10')}
      style={rootStyle}
    >
      {mode === 'pdf' && (
        <p className="mb-2 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
          Approximate PDF preview — download the PDF after saving for the exact print output.
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <HeaderBlock config={config} branding={branding} theme={theme} address={address} />

        {Object.values(config.invoice_info.fields).some(Boolean) && (
          <div className="shrink-0 text-right text-xs">
            <p className="font-semibold tracking-wide" style={{ color: theme.primary_color }}>{data.documentLabel.toUpperCase()}</p>
            <div className="mt-1 grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-muted-foreground">
              {config.invoice_info.fields.invoice_number && <><span>Invoice No.</span><span>: {data.number}</span></>}
              {config.invoice_info.fields.date && <><span>Invoice Date</span><span>: {data.date}</span></>}
              {config.invoice_info.fields.time && <><span>Invoice Time</span><span>: {data.time}</span></>}
              {config.invoice_info.fields.due_date && data.dueDate && <><span>Due Date</span><span>: {data.dueDate}</span></>}
              {config.invoice_info.fields.cashier && data.cashier && <><span>Cashier</span><span>: {data.cashier}</span></>}
              {config.invoice_info.fields.counter && data.counter && <><span>Counter</span><span>: {data.counter}</span></>}
              {config.invoice_info.fields.order_number && data.orderNumber && <><span>Order No.</span><span>: {data.orderNumber}</span></>}
              {config.invoice_info.fields.customer_id && data.customerId && <><span>Customer ID</span><span>: {data.customerId}</span></>}
              {config.invoice_info.fields.payment_method && data.paymentMethod && <><span>Payment</span><span>: {data.paymentMethod}</span></>}
              {config.invoice_info.fields.payment_status && data.paymentStatus && <><span>Payment Status</span><span>: {data.paymentStatus}</span></>}
              {config.invoice_info.fields.invoice_status && data.invoiceStatus && <><span>Invoice Status</span><span>: {data.invoiceStatus}</span></>}
            </div>
          </div>
        )}
      </div>

      {Object.values(config.customer_details.fields).some(Boolean) && (
        <div
          className="mt-3 text-xs text-muted-foreground"
          style={{ borderTop: config.header.show_divider ? dividerBorder : undefined, borderBottom: config.header.show_divider ? dividerBorder : undefined, padding: '8px 0' }}
        >
          <p className="font-medium text-foreground">Bill To</p>
          <div className="mt-0.5 flex flex-wrap gap-x-4">
            {config.customer_details.fields.name && data.customer.name && <span>{data.customer.name}</span>}
            {config.customer_details.fields.company_name && data.customer.company_name && <span>{data.customer.company_name}</span>}
            {config.customer_details.fields.mobile && data.customer.mobile && <span>Mobile: {data.customer.mobile}</span>}
            {config.customer_details.fields.email && data.customer.email && <span>{data.customer.email}</span>}
            {config.customer_details.fields.address && data.customer.address && <span>{data.customer.address}</span>}
            {config.customer_details.fields.gstin && data.customer.gstin && <span>GSTIN: {data.customer.gstin}</span>}
            {config.customer_details.fields.loyalty_number && data.customer.loyalty_number && <span>Loyalty: {data.customer.loyalty_number}</span>}
            {config.customer_details.fields.membership && data.customer.membership && <span>Membership: {data.customer.membership}</span>}
          </div>
        </div>
      )}

      <table className="mt-3 w-full text-xs" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: theme.table_style === 'minimal' ? 'transparent' : theme.primary_color, color: theme.table_style === 'minimal' ? theme.primary_color : '#fff' }}>
            {visibleColumns.map((col) => (
              <th
                key={col.key}
                className="px-2 py-1.5 font-medium"
                style={{
                  textAlign: col.align,
                  width: col.width ? `${col.width}%` : undefined,
                  borderBottom: theme.table_style === 'minimal' ? `2px solid ${theme.primary_color}` : undefined,
                }}
              >
                {itemColumnLabel(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, idx) => (
            <tr
              key={idx}
              style={{
                background: config.item_table.alternate_row_colors && idx % 2 === 1 ? '#f9fafb' : 'transparent',
              }}
            >
              {visibleColumns.map((col) => (
                <td
                  key={col.key}
                  className="px-2 py-1.5"
                  style={{
                    textAlign: col.align,
                    borderBottom: config.item_table.show_borders ? '1px solid #e5e7eb' : undefined,
                  }}
                >
                  {col.key === 'row_number' ? idx + 1 : (item.values[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 ml-auto max-w-xs space-y-1 text-xs">
        {config.tax_summary.fields.subtotal && <TotalRow label="Subtotal" value={data.totals.subtotal ?? 0} />}
        {config.tax_summary.fields.discount && <TotalRow label="Discount" value={data.totals.discount ?? 0} />}
        {config.tax_summary.fields.cgst && <TotalRow label="CGST" value={data.totals.cgst ?? 0} />}
        {config.tax_summary.fields.sgst && <TotalRow label="SGST" value={data.totals.sgst ?? 0} />}
        {config.tax_summary.fields.igst && <TotalRow label="IGST" value={data.totals.igst ?? 0} />}
        {config.tax_summary.fields.cess && <TotalRow label="CESS" value={data.totals.cess ?? 0} />}
        {config.tax_summary.fields.shipping && <TotalRow label="Shipping" value={data.totals.shipping ?? 0} />}
        {config.tax_summary.fields.packing && <TotalRow label="Packing" value={data.totals.packing ?? 0} />}
        {config.tax_summary.fields.round_off && <TotalRow label="Round Off" value={data.totals.round_off ?? 0} />}
        {config.tax_summary.fields.grand_total && (
          <TotalRow label="Grand Total" value={data.totals.grand_total ?? 0} bold color={theme.primary_color} />
        )}
        {config.tax_summary.fields.paid && <TotalRow label="Paid" value={data.totals.paid ?? 0} />}
        {config.tax_summary.fields.outstanding && <TotalRow label="Outstanding" value={data.totals.outstanding ?? 0} />}
        {config.tax_summary.fields.balance && <TotalRow label="Balance" value={data.totals.balance ?? 0} />}
        {config.tax_summary.fields.amount_in_words && data.totals.amount_in_words && (
          <p className="pt-1 text-[10px] italic text-muted-foreground">{data.totals.amount_in_words}</p>
        )}
      </div>

      {(config.qr_barcode.invoice_qr || config.qr_barcode.payment_qr || config.qr_barcode.business_qr ||
        config.qr_barcode.website_qr || config.qr_barcode.feedback_qr || config.qr_barcode.barcode) && (
        <div className="mt-4 flex flex-wrap justify-center gap-4 border-t pt-3">
          {config.qr_barcode.invoice_qr && <QrPlaceholder label="Invoice QR" />}
          {config.qr_barcode.payment_qr && <QrPlaceholder label="Pay via UPI" />}
          {config.qr_barcode.business_qr && <QrPlaceholder label="Business Card" />}
          {config.qr_barcode.website_qr && <QrPlaceholder label="Website" />}
          {config.qr_barcode.feedback_qr && <QrPlaceholder label="Feedback" />}
          {config.qr_barcode.barcode && <BarcodePlaceholder />}
        </div>
      )}

      {footerSections.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t pt-3 text-center text-[11px] text-muted-foreground">
          {footerSections.map((section) => (
            <p key={section.key}>{section.text}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function itemColumnLabel(key: string): string {
  const labels: Record<string, string> = {
    row_number: '#', product: 'Item', sku: 'SKU', barcode: 'Barcode', hsn_sac: 'HSN/SAC', batch: 'Batch',
    expiry: 'Expiry', serial: 'Serial', description: 'Description', qty: 'Qty', unit: 'Unit',
    mrp: 'MRP', selling_price: 'Price', discount: 'Disc.', tax: 'Tax', amount: 'Amount',
  };
  return labels[key] ?? key;
}

function TotalRow({ label, value, bold, color }: { label: string; value: number; bold?: boolean; color?: string }) {
  return (
    <div className={cn('flex justify-between', bold && 'text-sm font-semibold')} style={bold ? { color } : undefined}>
      <span>{label}</span>
      <span>{value.toFixed(2)}</span>
    </div>
  );
}

function HeaderBlock({
  config,
  branding,
  theme,
  address,
}: {
  config: InvoiceTemplateConfig;
  branding: BrandingValues;
  theme: InvoiceTemplateConfig['theme'];
  address: string | null;
}) {
  const { branding: b, header } = config;
  const heightPad = header.height_preset === 'compact' ? 6 : header.height_preset === 'tall' ? 20 : 12;

  const logo = b.show_logo && branding.logo_url ? (
    <img src={branding.logo_url} alt="" className="h-12 w-auto object-contain" />
  ) : b.show_logo ? (
    <div className="flex h-12 w-12 items-center justify-center rounded border text-[9px] text-muted-foreground">LOGO</div>
  ) : null;

  const identity = (
    <div className={header.layout === 'logo-center' ? 'text-center' : header.layout === 'logo-right' ? 'text-right' : 'text-left'}>
      {b.show_business_name && (
        <p className="text-lg font-bold" style={{ color: theme.primary_color }}>{branding.company_name || 'Your Business Name'}</p>
      )}
      {b.show_tagline && branding.tagline && <p className="text-xs italic text-muted-foreground">{branding.tagline}</p>}
      {b.show_address && address && <p className="text-xs text-muted-foreground">{address}</p>}
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {b.show_phone && branding.phone && <span>{branding.phone}</span>}
        {b.show_email && branding.email && <span>{branding.email}</span>}
        {b.show_website && branding.website && <span>{branding.website}</span>}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
        {b.show_gstin && branding.gst_number && <span>GSTIN: {branding.gst_number}</span>}
        {b.show_pan && branding.pan_number && <span>PAN: {branding.pan_number}</span>}
        {b.show_fssai && branding.fssai_number && <span>FSSAI: {branding.fssai_number}</span>}
        {b.show_drug_license && branding.drug_license_number && <span>DL No: {branding.drug_license_number}</span>}
        {b.show_msme_udyam && branding.msme_udyam_number && <span>MSME: {branding.msme_udyam_number}</span>}
      </div>
      {b.show_social_links && branding.social_links && b.social_links_to_show.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
          {b.social_links_to_show.map((platform) =>
            branding.social_links?.[platform] ? <span key={platform}>{platform}: {branding.social_links[platform]}</span> : null,
          )}
        </div>
      )}
    </div>
  );

  const containerStyle: CSSProperties = {
    background: header.background_color ?? undefined,
    border: header.show_border ? '1px solid #e5e7eb' : undefined,
    borderRadius: header.border_radius,
    padding: heightPad,
  };

  if (header.layout === 'banner') {
    return (
      <div className="text-center" style={{ ...containerStyle, background: header.background_color ?? `${theme.primary_color}11` }}>
        <div className="flex flex-col items-center gap-1.5">
          {logo}
          {identity}
        </div>
      </div>
    );
  }

  if (header.layout === 'modern-card') {
    return (
      <div className="shadow-sm" style={{ ...containerStyle, borderRadius: Math.max(header.border_radius, 10) }}>
        <div className="flex items-center gap-3">
          {logo}
          {identity}
        </div>
      </div>
    );
  }

  if (header.layout === 'minimal') {
    return <div style={{ padding: heightPad }}>{identity}</div>;
  }

  const flexDirection = header.layout === 'logo-right' ? 'row-reverse' : header.layout === 'logo-center' ? 'column' : 'row';

  return (
    <div style={containerStyle}>
      <div className={cn('flex items-center gap-3', header.layout === 'logo-center' && 'flex-col items-center')} style={{ flexDirection }}>
        {logo}
        {identity}
      </div>
    </div>
  );
}
