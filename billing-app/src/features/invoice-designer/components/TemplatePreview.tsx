import type { CSSProperties } from 'react';
import type { InvoiceTemplateConfig, PreviewData, PromotionContent } from '@/features/invoice-designer/api';
import { cn } from '@/lib/utils';
import { buildUpiUri, paymentQrEnabled, paymentQrVisibleForAmount } from '@/lib/upi';
import { QrCode } from '@/features/invoice-designer/components/QrCode';

const BILLIQ_BRAND_COLOR = '#6C47FF';
const PROMOTION_FONT_SIZE_PX: Record<InvoiceTemplateConfig['billiq_promotion']['font_size'], number> = {
  sm: 10, md: 11.5, lg: 13,
};
const PROMOTION_SPACING_PX: Record<InvoiceTemplateConfig['billiq_promotion']['spacing'], number> = {
  compact: 2, normal: 4, relaxed: 8,
};

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
  /** The tenant's real merchant VPA. The Payment QR preview used to print a hardcoded
   * "your-upi@bank", which reads as the product having ignored the UPI ID they just saved. */
  upi_vpa?: string | null;
}

interface TemplatePreviewProps {
  config: InvoiceTemplateConfig;
  branding: BrandingValues;
  mode: PreviewMode;
  data: PreviewData;
  /** RevGenAI's centrally-managed promotional copy (see getPromotionConfig) — null while
   * loading or when fetched anonymously. The tenant-level on/off switch is config.billiq_promotion. */
  promotionContent?: PromotionContent | null;
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

// 'md' matches Tailwind's text-xl (1.25rem = 20px) — this replaces what used to be a fixed
// text-xl class on the business-name header, so the default appearance is unchanged.
const BUSINESS_NAME_FONT_SIZE_PX: Record<InvoiceTemplateConfig['branding']['business_name_size'], number> = {
  sm: 16, md: 20, lg: 26,
};

function addressLine(branding: BrandingValues): string | null {
  const parts = [branding.address_line1, branding.address_line2, [branding.city, branding.state].filter(Boolean).join(', '), branding.pincode]
    .filter((part) => part && part.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
}

/** One QR on the document: the tenant's uploaded image if they have one, otherwise a real code
 * encoding `value`. Only falls back to the decorative grid when there is nothing to encode (e.g.
 * a website QR switched on before a website is saved), where a stand-in is honest because no code
 * would print either. */
function QrPlaceholder({ label, imageUrl, value }: { label: string; imageUrl?: string; value?: string | null }) {
  if (imageUrl) {
    return (
      <div className="flex flex-col items-center gap-1">
        <img src={imageUrl} alt={label} className="size-14 border bg-white object-contain p-0.5" />
        <span className="text-[9px] text-muted-foreground">{label}</span>
      </div>
    );
  }
  if (value) {
    return (
      <div className="flex flex-col items-center gap-1">
        <QrCode value={value} size={56} />
        <span className="text-[9px] text-muted-foreground">{label}</span>
      </div>
    );
  }
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

function PromotionBlock({
  config,
  content,
  isThermal,
}: {
  config: InvoiceTemplateConfig['billiq_promotion'];
  content: PromotionContent;
  isThermal: boolean;
}) {
  const textAlign = isThermal ? 'center' : config.alignment;
  const fontSize = PROMOTION_FONT_SIZE_PX[config.font_size];
  const gap = PROMOTION_SPACING_PX[config.spacing];
  const layout = config.layout;

  // Always exactly two text lines (title, then website+phone combined) regardless of paper
  // size — the slogan is an explicit opt-in third line, never mandatory. `layout` now only
  // controls the banner border below, not how many lines the identity block takes.
  const body = (
    <div
      className={cn('mt-4 pt-3', config.separator_line && 'border-t')}
      style={{ textAlign, fontSize }}
    >
      <p className="font-bold" style={{ color: BILLIQ_BRAND_COLOR, marginBottom: gap }}>
        {content.title}
      </p>
      {config.show_description && (
        <p className="text-muted-foreground" style={{ marginBottom: gap }}>{content.description}</p>
      )}
      <p className="text-muted-foreground" style={{ marginBottom: gap }}>
        {content.website} · {content.phone}
      </p>
      {config.qr_enabled && (
        <div className={cn('flex', textAlign === 'center' ? 'justify-center' : textAlign === 'right' ? 'justify-end' : 'justify-start')} style={{ marginTop: gap }}>
          {/* RevGenAI's own promo link, the same one the PDF renderer encodes (promo.qr_url).
              Falls back to the website when no explicit QR URL is configured. */}
          <QrPlaceholder label="Scan to learn more" value={content.qr_url || content.website} />
        </div>
      )}
      {!isThermal && layout === 'banner' && (
        <p className="italic text-muted-foreground" style={{ marginTop: gap, fontSize: fontSize - 0.5 }}>
          {content.cta_text}
        </p>
      )}
    </div>
  );

  if (layout === 'banner' && !isThermal) {
    return (
      <div className="mt-2 rounded-lg border-2 p-3" style={{ borderColor: BILLIQ_BRAND_COLOR }}>
        {body}
      </div>
    );
  }
  return body;
}

export function TemplatePreview({ config, branding, mode, data, promotionContent }: TemplatePreviewProps) {
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
      // Print routes target this slot to restore the receipt's real width: `maxWidth: '100%'`
      // below is right on screen (the designer panel is narrower than an A4 sheet) but on paper
      // it silently shrank the receipt to whatever the page had left. See lib/printing/printPage.
      data-slot="template-preview"
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
            {/* Each encodes exactly what the PDF and thermal renderers encode for the same type
                (pdf_renderer.py, silentPrint.ts), so a code scanned off a printed page carries the
                same payload whichever path printed it. */}
            {config.qr_barcode.invoice_qr && (
              <QrPlaceholder
                label="Invoice QR"
                imageUrl={config.qr_barcode.custom_images?.invoice_qr}
                value={`Invoice:${data.number}|Amount:${(data.totals.grand_total ?? 0).toFixed(2)}`}
              />
            )}
            {config.qr_barcode.payment_qr && (
              <QrPlaceholder
                label="Pay via UPI"
                imageUrl={config.qr_barcode.custom_images?.payment_qr}
                value={
                  branding.upi_vpa
                    ? buildUpiUri({
                        vpa: branding.upi_vpa,
                        payeeName: branding.company_name,
                        amount: data.totals.grand_total ?? null,
                        transactionRef: data.number,
                        transactionNote: `Invoice ${data.number}`,
                      })
                    : null
                }
              />
            )}
            {config.qr_barcode.business_qr && (
              <QrPlaceholder
                label="Business Card"
                imageUrl={config.qr_barcode.custom_images?.business_qr}
                value={`${branding.company_name}\n${branding.phone ?? ''}\n${branding.email ?? ''}`}
              />
            )}
            {config.qr_barcode.website_qr && (
              <QrPlaceholder
                label="Website"
                imageUrl={config.qr_barcode.custom_images?.website_qr}
                value={branding.website}
              />
            )}
            {config.qr_barcode.feedback_qr && (
              <QrPlaceholder
                label="Feedback"
                imageUrl={config.qr_barcode.custom_images?.feedback_qr}
                value={branding.feedback_url}
              />
            )}
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

      <PaymentQrBlock config={config} data={data} branding={branding} />

      {config.billiq_promotion.enabled && promotionContent && (
        <PromotionBlock config={config.billiq_promotion} content={promotionContent} isThermal={isThermal} />
      )}
    </div>
  );
}

const PAYMENT_QR_PREVIEW_PX: Record<InvoiceTemplateConfig['payment_qr']['size'], number> = {
  sm: 48,
  md: 64,
  lg: 88,
};

/** Preview of the Payment QR element. Mirrors the PDF renderer's own rules (see
 * backend app/core/upi.py) so the Designer shows what will actually print: the QR disappears once
 * nothing is outstanding unless it's set to always show, because a scannable QR on a settled bill
 * invites a second payment. */
function PaymentQrBlock({
  config,
  data,
  branding,
}: {
  config: InvoiceTemplateConfig;
  data: PreviewData;
  branding: BrandingValues;
}) {
  const qr = config.payment_qr;
  const outstanding = data.totals.outstanding;
  const amountDue = outstanding ?? data.totals.grand_total ?? 0;

  // Shared with the receipt and PDF paths so the preview cannot drift from what actually prints.
  if (!paymentQrEnabled(config.qr_barcode.payment_qr, qr.enabled)) return null;
  if (!paymentQrVisibleForAmount(qr.visibility, amountDue)) return null;

  const size = PAYMENT_QR_PREVIEW_PX[qr.size];
  const uploaded = config.qr_barcode.custom_images?.payment_qr;
  // The same URI the PDF and thermal paths build (app/core/upi.py, lib/upi.ts), so the code a
  // customer scans off this page is the code they would scan off any other output.
  const upiUri = branding.upi_vpa
    ? buildUpiUri({
        vpa: branding.upi_vpa,
        payeeName: branding.company_name,
        amount: qr.show_amount ? amountDue : null,
        transactionRef: data.number,
        transactionNote: `Invoice ${data.number}`,
      })
    : null;
  return (
    <div className="mt-4 flex flex-col items-center gap-1 border-t pt-3">
      {uploaded ? (
        // Their own code, exactly as it will print.
        <img
          src={uploaded}
          alt="Payment QR"
          style={{ width: size, height: size }}
          className="border bg-white object-contain p-0.5"
        />
      ) : upiUri ? (
        <QrCode value={upiUri} size={size} />
      ) : (
        // No merchant VPA, so there is nothing payable to encode. Say so rather than drawing a
        // code that cannot be paid.
        <span className="text-[9px] italic text-muted-foreground">
          Add your UPI ID in Settings to print a payment QR
        </span>
      )}
      {qr.label && <span className="text-[11px] font-medium">{qr.label}</span>}
      {qr.show_amount && amountDue > 0 && (
        <span className="text-[10px] text-muted-foreground">Amount: {amountDue.toFixed(2)}</span>
      )}
      {qr.show_upi_id && (
        <span className="text-[10px] text-muted-foreground">
          {branding.upi_vpa || 'Set your UPI ID in Settings → Billing Settings'}
        </span>
      )}
      {qr.show_payment_status && (
        <span className="text-[10px] text-muted-foreground">
          {amountDue <= 0 ? 'Paid' : `Outstanding: ${amountDue.toFixed(2)}`}
        </span>
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
        <p
          className="leading-tight font-extrabold tracking-tight"
          style={{ color: theme.primary_color, fontSize: BUSINESS_NAME_FONT_SIZE_PX[b.business_name_size] }}
        >
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
