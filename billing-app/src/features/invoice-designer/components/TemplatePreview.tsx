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

const LOGO_SIZE_PX: Record<InvoiceTemplateConfig['paper']['logo_size_preset'], { width: number; height: number }> = {
  sm: { width: 64, height: 40 },
  md: { width: 88, height: 56 },
  lg: { width: 112, height: 72 },
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
  // Below this width there's no room for a real two-column header — every professional invoice
  // tool (Zoho, Shopify, Tally) stacks business/invoice info into one column on receipts and
  // narrow screens instead. Everywhere else, the two blocks stay side by side via CSS grid
  // (not flexbox+wrap), so a growing left column can never push the right column down a line —
  // grid columns don't reflow onto each other the way wrapped flex items do.
  const stacked = isThermal || mode === 'mobile';
  const theme = config.theme;
  const paper = config.paper;
  const address = addressLine(branding);
  const visibleColumns = [...config.item_table.columns].filter((c) => c.visible).sort((a, b) => a.order - b.order);
  const footerSections = [...config.footer.sections].filter((s) => s.enabled).sort((a, b) => a.order - b.order);
  const hasInvoiceInfo = Object.values(config.invoice_info.fields).some(Boolean);
  const signature = config.signature;

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

      <div className={cn(!stacked && 'grid grid-cols-[minmax(55%,1fr)_minmax(0,44%)] items-start gap-4', stacked && 'flex flex-col gap-3')}>
        <HeaderBlock config={config} branding={branding} theme={theme} address={address} />

        {hasInvoiceInfo && (
          <div className={cn('min-w-0', stacked ? 'text-left' : 'text-right')}>
            <p
              className="text-base font-bold tracking-wide"
              style={{ color: theme.primary_color }}
            >
              {data.documentLabel.toUpperCase()}
            </p>
            {/* One label:value per line (rather than a 2-column sub-grid) keeps this block's
                footprint compact no matter how many fields are enabled, so it can never eat
                into the business-info column's share of the header row. */}
            <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
              {config.invoice_info.fields.invoice_number && <p>Invoice No.: <span className="font-medium text-foreground">{data.number}</span></p>}
              {config.invoice_info.fields.date && <p>Invoice Date: <span className="font-medium text-foreground">{data.date}</span></p>}
              {config.invoice_info.fields.time && <p>Invoice Time: <span className="font-medium text-foreground">{data.time}</span></p>}
              {config.invoice_info.fields.due_date && data.dueDate && <p>Due Date: <span className="font-medium text-foreground">{data.dueDate}</span></p>}
              {config.invoice_info.fields.cashier && data.cashier && <p>Cashier: <span className="font-medium text-foreground">{data.cashier}</span></p>}
              {config.invoice_info.fields.counter && data.counter && <p>Counter: <span className="font-medium text-foreground">{data.counter}</span></p>}
              {config.invoice_info.fields.order_number && data.orderNumber && <p>Order No.: <span className="font-medium text-foreground">{data.orderNumber}</span></p>}
              {config.invoice_info.fields.customer_id && data.customerId && <p>Customer ID: <span className="font-medium text-foreground">{data.customerId}</span></p>}
              {config.invoice_info.fields.payment_method && data.paymentMethod && <p>Payment: <span className="font-medium text-foreground">{data.paymentMethod}</span></p>}
              {config.invoice_info.fields.payment_status && data.paymentStatus && <p>Payment Status: <span className="font-medium text-foreground">{data.paymentStatus}</span></p>}
              {config.invoice_info.fields.invoice_status && data.invoiceStatus && <p>Invoice Status: <span className="font-medium text-foreground">{data.invoiceStatus}</span></p>}
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

      <div className={cn('mt-4 flex gap-6', stacked ? 'flex-col' : 'flex-wrap items-start justify-end')}>
        <div className={cn('space-y-1 text-xs', stacked ? 'w-full' : 'min-w-36')}>
          {config.tax_summary.fields.subtotal && <TotalRow label="Subtotal" value={data.totals.subtotal ?? 0} />}
          {config.tax_summary.fields.discount && <TotalRow label="Discount" value={data.totals.discount ?? 0} />}
          {config.tax_summary.fields.cgst && <TotalRow label="CGST" value={data.totals.cgst ?? 0} />}
          {config.tax_summary.fields.sgst && <TotalRow label="SGST" value={data.totals.sgst ?? 0} />}
          {config.tax_summary.fields.igst && <TotalRow label="IGST" value={data.totals.igst ?? 0} />}
          {config.tax_summary.fields.cess && <TotalRow label="CESS" value={data.totals.cess ?? 0} />}
          {config.tax_summary.fields.shipping && <TotalRow label="Shipping" value={data.totals.shipping ?? 0} />}
          {config.tax_summary.fields.packing && <TotalRow label="Packing" value={data.totals.packing ?? 0} />}
          {config.tax_summary.fields.round_off && <TotalRow label="Round Off" value={data.totals.round_off ?? 0} />}
          {config.tax_summary.fields.amount_in_words && data.totals.amount_in_words && (
            <p className="max-w-56 pt-1.5 text-[10px] italic text-muted-foreground">{data.totals.amount_in_words}</p>
          )}
        </div>

        {(config.tax_summary.fields.grand_total || config.tax_summary.fields.paid || config.tax_summary.fields.outstanding || config.tax_summary.fields.balance) && (
          <div className={cn('space-y-1.5', stacked ? 'w-full' : 'w-44 shrink-0')}>
            {config.tax_summary.fields.grand_total && (
              <div
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-bold text-white"
                style={{ background: theme.primary_color }}
              >
                <span>Grand Total</span>
                <span>{(data.totals.grand_total ?? 0).toFixed(2)}</span>
              </div>
            )}
            {config.tax_summary.fields.paid && (
              <div className="flex justify-between px-1 text-xs font-medium" style={{ color: theme.primary_color }}>
                <span>Paid{data.paymentMethod ? ` (${data.paymentMethod})` : ''}</span>
                <span>{(data.totals.paid ?? 0).toFixed(2)}</span>
              </div>
            )}
            {config.tax_summary.fields.outstanding && (
              <TotalRow label="Outstanding" value={data.totals.outstanding ?? 0} />
            )}
            {config.tax_summary.fields.balance && (
              <div className="flex justify-between px-1 text-xs font-medium" style={{ color: theme.primary_color }}>
                <span>Balance</span>
                <span>{(data.totals.balance ?? 0).toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {(() => {
        const shortFooter = footerSections.filter((s) => s.key === 'thank_you' || s.key === 'business_notes');
        const policyFooter = footerSections.filter((s) => s.key !== 'thank_you' && s.key !== 'business_notes');
        return (
          <>
            {shortFooter.length > 0 && (
              <div className="mt-4 space-y-0.5 border-t pt-3 text-center">
                {shortFooter.map((section) => (
                  <p key={section.key} className="text-sm font-semibold" style={{ color: theme.primary_color }}>
                    {section.text}
                  </p>
                ))}
              </div>
            )}
            {policyFooter.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[10px] text-muted-foreground">
                {policyFooter.map((section) => (
                  <li key={section.key}>{section.text}</li>
                ))}
              </ul>
            )}
          </>
        );
      })()}

      {(config.qr_barcode.invoice_qr || config.qr_barcode.payment_qr || config.qr_barcode.business_qr ||
        config.qr_barcode.website_qr || config.qr_barcode.feedback_qr || config.qr_barcode.barcode ||
        signature.show_authorized_signature || signature.show_customer_signature) && (
        <div className={cn('mt-4 flex gap-4 border-t pt-3', stacked ? 'flex-col items-center' : 'flex-wrap items-end justify-between')}>
          <div className="flex flex-wrap justify-center gap-4">
            {config.qr_barcode.invoice_qr && <QrPlaceholder label="Invoice QR" />}
            {config.qr_barcode.payment_qr && <QrPlaceholder label="Pay via UPI" />}
            {config.qr_barcode.business_qr && <QrPlaceholder label="Business Card" />}
            {config.qr_barcode.website_qr && <QrPlaceholder label="Website" />}
            {config.qr_barcode.feedback_qr && <QrPlaceholder label="Feedback" />}
            {config.qr_barcode.barcode && <BarcodePlaceholder />}
          </div>
          {(signature.show_authorized_signature || signature.show_customer_signature) && (
            <div className="flex gap-8">
              {signature.show_authorized_signature && (
                <div className="text-center text-[10px] text-muted-foreground">
                  <div className="mb-1.5 h-8 w-28 border-b" />
                  Authorized Signature
                </div>
              )}
              {signature.show_customer_signature && (
                <div className="text-center text-[10px] text-muted-foreground">
                  <div className="mb-1.5 h-8 w-28 border-b" />
                  Customer Signature
                </div>
              )}
            </div>
          )}
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

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
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
  const { branding: b, header, paper } = config;
  const heightPad = header.height_preset === 'compact' ? 6 : header.height_preset === 'tall' ? 20 : 12;
  const logoSize = LOGO_SIZE_PX[paper.logo_size_preset];

  const logo = b.show_logo && branding.logo_url ? (
    <img
      src={branding.logo_url}
      alt=""
      className="shrink-0 object-contain"
      style={{ maxWidth: logoSize.width, maxHeight: logoSize.height, width: 'auto', height: 'auto' }}
    />
  ) : b.show_logo ? (
    <div
      className="flex shrink-0 items-center justify-center rounded border text-[9px] text-muted-foreground"
      style={{ width: logoSize.width, height: logoSize.height }}
    >
      LOGO
    </div>
  ) : null;

  const identity = (
    <div className={cn('min-w-0', header.layout === 'logo-center' ? 'text-center' : header.layout === 'logo-right' ? 'text-right' : 'text-left')}>
      {b.show_business_name && (
        <p className="text-xl leading-tight font-extrabold tracking-tight" style={{ color: theme.primary_color }}>
          {branding.company_name || 'Your Business Name'}
        </p>
      )}
      {b.show_tagline && branding.tagline && <p className="break-words text-xs italic text-muted-foreground">{branding.tagline}</p>}
      {b.show_address && address && <p className="mt-0.5 break-words text-xs text-muted-foreground">{address}</p>}
      <div className="mt-0.5 flex flex-wrap gap-x-3 break-words text-xs text-muted-foreground">
        {b.show_phone && branding.phone && <span>{branding.phone}</span>}
        {b.show_email && branding.email && <span>{branding.email}</span>}
        {b.show_website && branding.website && <span>{branding.website}</span>}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 break-words text-[10px] text-muted-foreground">
        {b.show_gstin && branding.gst_number && <span>GSTIN: {branding.gst_number}</span>}
        {b.show_pan && branding.pan_number && <span>PAN: {branding.pan_number}</span>}
        {b.show_fssai && branding.fssai_number && <span>FSSAI: {branding.fssai_number}</span>}
        {b.show_drug_license && branding.drug_license_number && <span>DL No: {branding.drug_license_number}</span>}
        {b.show_msme_udyam && branding.msme_udyam_number && <span>MSME: {branding.msme_udyam_number}</span>}
      </div>
      {b.show_social_links && branding.social_links && b.social_links_to_show.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-x-3 break-words text-[10px] text-muted-foreground">
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
      <div className="min-w-0 text-center" style={{ ...containerStyle, background: header.background_color ?? `${theme.primary_color}11` }}>
        <div className="flex flex-col items-center gap-1.5">
          {logo}
          {identity}
        </div>
      </div>
    );
  }

  if (header.layout === 'modern-card') {
    return (
      <div className="min-w-0 shadow-sm" style={{ ...containerStyle, borderRadius: Math.max(header.border_radius, 10) }}>
        <div className="flex min-w-0 items-center gap-3">
          {logo}
          {identity}
        </div>
      </div>
    );
  }

  if (header.layout === 'minimal') {
    return <div className="min-w-0" style={{ padding: heightPad }}>{identity}</div>;
  }

  const flexDirection = header.layout === 'logo-right' ? 'row-reverse' : header.layout === 'logo-center' ? 'column' : 'row';

  return (
    <div className="min-w-0" style={containerStyle}>
      <div className={cn('flex min-w-0 items-center gap-3', header.layout === 'logo-center' && 'flex-col items-center')} style={{ flexDirection }}>
        {logo}
        {identity}
      </div>
    </div>
  );
}
