/** Shared "respect Settings > Automatic Printing, only fall back to opening a print-preview tab
 * if that fails or nothing is configured" logic for print actions *outside* the post-checkout
 * auto-print flow (InvoiceSuccessDialog.tsx has its own version of this for the auto-print effect,
 * which needs tighter integration with its component's loading states — buildInvoiceReceiptPayload
 * below is shared with it so both flows render byte-identical receipts).
 *
 * Every manual "Print" action (POS's "Print Order Bill", the Invoices list's row Print button,
 * and originally InvoiceSuccessDialog's own manual Print button too) used to unconditionally
 * `window.open()` a new print-preview tab, ignoring whichever transport was actually configured —
 * a real bug: a tenant with a RevGenAI Print Agent/QZ Tray/Web USB/Web Bluetooth printer set up
 * still got a browser print dialog on every manual print click. */

import * as posApi from '@/features/pos/api';
import type { Invoice } from '@/features/pos/api';
import * as settingsApi from '@/features/settings/api';
import type { AutoPrintPaperSize, Settings } from '@/features/settings/api';
import * as invoiceDesignerApi from '@/features/invoice-designer/api';
import { getPromotionConfig } from '@/features/invoice-designer/api';
import type { InvoiceTemplate, PromotionContent } from '@/features/invoice-designer/api';
import { useAuthStore } from '@/features/auth/store/authStore';
import { buildPaymentQrEntry } from '@/lib/upi';
import type { Tenant } from '@/features/auth/api';
import * as qzTray from '@/lib/printing/qzTray';
import * as printAgentClient from '@/lib/printing/printAgentClient';
import * as webUsbPrinter from '@/lib/printing/webUsbPrinter';
import * as webBluetoothPrinter from '@/lib/printing/webBluetoothPrinter';
import { resolveDeviceMode } from '@/lib/printing/deviceProfile';
import {
  buildReceiptCommands,
  numberToWordsInr,
  type ReceiptBusinessInfo,
  type ReceiptData,
  type ReceiptPromotion,
  type ThermalPaperSize,
} from '@/lib/printing/escpos';
import { buildLogoCommand } from '@/lib/printing/escposLogo';
import type { ProvisionalBillSnapshot } from '@/features/pos/lib/provisionalBill';

const THERMAL_PAPER_SIZES: AutoPrintPaperSize[] = ['58mm', '80mm'];
function isThermalPaperSize(size: AutoPrintPaperSize): size is ThermalPaperSize {
  return THERMAL_PAPER_SIZES.includes(size);
}

interface PrintContext {
  settings: Settings;
  template: InvoiceTemplate | undefined;
  promotionContent: PromotionContent | null;
  tenant: Tenant | null;
}

async function loadPrintContext(): Promise<PrintContext> {
  const [settings, templates, promotionContent] = await Promise.all([
    settingsApi.getSettings(),
    invoiceDesignerApi.getDefaultTemplates(),
    getPromotionConfig().catch(() => null),
  ]);
  return { settings, template: templates.tax_invoice, promotionContent, tenant: useAuthStore.getState().tenant };
}

function formatEnumLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Ported from InvoiceSuccessDialog.tsx's own (formerly private) buildReceiptPayload, unchanged —
 * kept in sync there via a direct re-export so a real invoice's receipt looks identical whether it
 * was auto-printed after checkout or manually reprinted later from the Invoices list. */
export function buildInvoiceReceiptPayload(
  invoice: Invoice,
  ctx: PrintContext,
  logoCommand: string | null,
): { business: ReceiptBusinessInfo; data: ReceiptData } | null {
  const { settings, template, promotionContent, tenant } = ctx;
  const companyName = tenant?.company_name ?? 'Receipt';
  const config = template?.config;

  const qrCodes: { caption: string; data: string }[] = [];
  if (config?.qr_barcode.invoice_qr) {
    qrCodes.push({ caption: 'Invoice QR', data: `Invoice:${invoice.invoice_number}|Amount:${invoice.total_amount.toFixed(2)}` });
  }
  if (config) {
    // An invoice with no outstanding figure is unpaid in full as far as the QR is concerned —
    // the ordinary "here is your bill, please pay it" case. Same rule as the PDF renderer.
    const paymentQr = buildPaymentQrEntry({
      qrBarcodePaymentQr: config.qr_barcode.payment_qr,
      paymentQr: config.payment_qr,
      amountDue: invoice.outstanding_amount ?? invoice.total_amount,
      vpa: settings.upi_vpa,
      payeeName: settings.upi_merchant_name || companyName,
      reference: invoice.invoice_number,
    });
    if (paymentQr) qrCodes.push(paymentQr);
  }
  if (config?.qr_barcode.business_qr) {
    qrCodes.push({ caption: 'Business Card', data: `${companyName}\n${tenant?.phone ?? ''}\n${tenant?.email ?? ''}` });
  }
  if (config?.qr_barcode.website_qr && settings.website) {
    qrCodes.push({ caption: 'Visit Us', data: settings.website });
  }
  if (config?.qr_barcode.feedback_qr && settings.feedback_url) {
    qrCodes.push({ caption: 'Feedback', data: settings.feedback_url });
  }

  const footerSections = (config?.footer.sections ?? [])
    .filter((section) => section.enabled)
    .sort((a, b) => a.order - b.order)
    .map((section) => ({ text: section.text }));

  const promotion: ReceiptPromotion | null =
    config?.billiq_promotion.enabled && promotionContent
      ? {
          title: promotionContent.title,
          description: config.billiq_promotion.show_description ? promotionContent.description : null,
          website: promotionContent.website,
          phone: promotionContent.phone,
          qrUrl: config.billiq_promotion.qr_enabled ? promotionContent.qr_url : null,
        }
      : null;

  const info = config?.invoice_info.fields;
  const customerFields = config?.customer_details.fields;
  const tax = config?.tax_summary.fields;

  const business: ReceiptBusinessInfo = {
    companyName,
    addressLine1: settings.address_line1,
    addressLine2: settings.address_line2,
    city: settings.city,
    state: settings.state,
    pincode: settings.pincode,
    gstNumber: settings.gst_number,
    phone: config?.branding.show_phone ? tenant?.phone : null,
    logoCommand,
    companyNameSize: config?.branding.business_name_size,
  };
  const data: ReceiptData = {
    invoiceNumber: invoice.invoice_number,
    createdAt: invoice.created_at,
    cashierName: invoice.created_by_name,
    customerName: invoice.customer_name,
    customerPhone: invoice.customer_phone,
    items: invoice.items.map((item) => ({
      name: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
    })),
    subtotal: invoice.subtotal,
    discountAmount: invoice.discount_amount,
    taxAmount: invoice.tax_amount,
    taxPercentage: invoice.tax_percentage,
    totalAmount: invoice.total_amount,
    paymentMethod: invoice.payment_method,
    amountTendered: invoice.amount_tendered,
    changeDue: invoice.change_due,
    footer: settings.receipt_footer,
    currency: settings.currency,
    decimalPrecision: settings.decimal_precision,
    roundOff: tax?.round_off ? 0 : undefined,
    footerSections,
    qrCodes,
    dueDate: invoice.due_date,
    customerId: invoice.customer_id,
    paymentStatus: formatEnumLabel(invoice.payment_status),
    invoiceStatus: formatEnumLabel(invoice.status),
    customerGstin: settings.gst_number,
    paidAmount: invoice.paid_amount,
    outstandingAmount: invoice.outstanding_amount,
    cgst: tax?.cgst ? invoice.tax_amount / 2 : null,
    sgst: tax?.sgst ? invoice.tax_amount / 2 : null,
    igst: tax?.igst ? invoice.tax_amount : null,
    amountInWords: tax?.amount_in_words ? numberToWordsInr(invoice.total_amount) : null,
    promotion,
    visibility:
      info && customerFields && tax
        ? {
            invoiceNumber: info.invoice_number,
            date: info.date,
            time: info.time,
            dueDate: info.due_date,
            cashier: info.cashier,
            customerId: info.customer_id,
            paymentMethod: info.payment_method,
            paymentStatus: info.payment_status,
            invoiceStatus: info.invoice_status,
            customerName: customerFields.name,
            customerMobile: customerFields.mobile,
            customerGstin: customerFields.gstin,
            subtotal: tax.subtotal,
            discount: tax.discount,
            grandTotal: tax.grand_total,
            paid: tax.paid,
            outstanding: tax.outstanding || tax.balance,
            amountInWords: tax.amount_in_words,
          }
        : undefined,
  };
  return { business, data };
}

/** Provisional Bill equivalent — there is no saved Invoice yet (see provisionalBill.ts), so this
 * mirrors buildInvoiceReceiptPayload's field derivations against a cart snapshot instead. QR
 * codes referencing an invoice number are skipped (there isn't one; ORD-prefixed references are
 * deliberately never treated as invoice numbers, see provisionalBill.ts). */
function buildProvisionalReceiptPayload(
  snapshot: ProvisionalBillSnapshot,
  ctx: PrintContext,
  logoCommand: string | null,
): { business: ReceiptBusinessInfo; data: ReceiptData } {
  const { settings, template, promotionContent, tenant } = ctx;
  const companyName = tenant?.company_name ?? 'Receipt';
  const config = template?.config;

  const qrCodes: { caption: string; data: string }[] = [];
  if (config) {
    // A provisional bill has taken no payment yet, so the whole total is what's due.
    const paymentQr = buildPaymentQrEntry({
      qrBarcodePaymentQr: config.qr_barcode.payment_qr,
      paymentQr: config.payment_qr,
      amountDue: snapshot.total,
      vpa: settings.upi_vpa,
      payeeName: settings.upi_merchant_name || companyName,
    });
    if (paymentQr) qrCodes.push(paymentQr);
  }
  if (config?.qr_barcode.business_qr) {
    qrCodes.push({ caption: 'Business Card', data: `${companyName}\n${tenant?.phone ?? ''}\n${tenant?.email ?? ''}` });
  }
  if (config?.qr_barcode.website_qr && settings.website) {
    qrCodes.push({ caption: 'Visit Us', data: settings.website });
  }

  const footerSections = (config?.footer.sections ?? [])
    .filter((section) => section.enabled)
    .sort((a, b) => a.order - b.order)
    .map((section) => ({ text: section.text }));

  const promotion: ReceiptPromotion | null =
    config?.billiq_promotion.enabled && promotionContent
      ? {
          title: promotionContent.title,
          description: config.billiq_promotion.show_description ? promotionContent.description : null,
          website: promotionContent.website,
          phone: promotionContent.phone,
          qrUrl: config.billiq_promotion.qr_enabled ? promotionContent.qr_url : null,
        }
      : null;

  const business: ReceiptBusinessInfo = {
    companyName,
    addressLine1: settings.address_line1,
    addressLine2: settings.address_line2,
    city: settings.city,
    state: settings.state,
    pincode: settings.pincode,
    gstNumber: settings.gst_number,
    phone: config?.branding.show_phone ? tenant?.phone : null,
    logoCommand,
    companyNameSize: config?.branding.business_name_size,
  };
  const data: ReceiptData = {
    invoiceNumber: snapshot.reference,
    createdAt: snapshot.createdAtIso,
    cashierName: '',
    customerName: snapshot.customerName,
    customerPhone: snapshot.customerPhone,
    items: snapshot.lines.map((line) => ({ name: line.productName, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal })),
    subtotal: snapshot.subtotal,
    discountAmount: snapshot.discountAmount,
    taxAmount: snapshot.taxAmount,
    taxPercentage: snapshot.taxPercentage,
    totalAmount: snapshot.total,
    paymentMethod: snapshot.paymentMethod,
    footer: `PROVISIONAL BILL — NOT A FINAL INVOICE\n${settings.receipt_footer ?? ''}`.trim(),
    currency: settings.currency,
    decimalPrecision: settings.decimal_precision,
    footerSections,
    qrCodes,
    promotion,
  };
  return { business, data };
}

/** Why a silent print didn't happen, so the caller can say so instead of dumping the cashier
 * into a system print dialog with no explanation. Every one of these used to be a bare `false`:
 * "no printer configured", "QZ Tray isn't running" and "printed fine" were indistinguishable,
 * and the fallback tab looked identical in all three cases. */
export type SilentPrintFailure =
  | 'not-configured'
  | 'browser-dialog'
  | 'no-printer'
  | 'non-thermal-preview'
  | 'transport-failed';

export type SilentPrintResult = { ok: true } | { ok: false; reason: SilentPrintFailure; detail?: string };

/** Human-readable explanation for a fallback, shown to the cashier before the print tab opens. */
export function silentPrintFailureMessage(result: Extract<SilentPrintResult, { ok: false }>): string | null {
  switch (result.reason) {
    case 'not-configured':
      return 'No printer is set up for automatic printing yet — opening the print preview. Set one up in Settings › Automatic Printing.';
    case 'no-printer':
      return 'Automatic printing has no printer selected — opening the print preview. Pick one in Settings › Automatic Printing.';
    case 'transport-failed':
      return `Couldn't reach the configured printer${result.detail ? ` (${result.detail})` : ''} — opening the print preview instead.`;
    // Deliberately silent: 'browser-dialog' is the tenant *choosing* the print dialog, and
    // 'non-thermal-preview' is an order bill on A4/Letter, which has no silent path by design.
    case 'browser-dialog':
    case 'non-thermal-preview':
      return null;
  }
}

/** The actual dispatch: tries whichever transport Settings > Automatic Printing has configured
 * for this tenant (with this device's own override on top, for Web USB/Bluetooth pairings that
 * can only live on one device), and reports why if it couldn't. Callers fall back to opening the
 * print-preview tab themselves — this function never does that itself, since the caller is what
 * knows which URL to open. */
async function dispatchSilentPrint(
  thermal: boolean,
  buildReceipt: () => { business: ReceiptBusinessInfo; data: ReceiptData } | null,
  paperSize: AutoPrintPaperSize,
  getPdf: () => Promise<Blob>,
): Promise<SilentPrintResult> {
  const preferences = await settingsApi.getBusinessPreferences();
  const deviceMode = resolveDeviceMode(preferences.auto_print_device_mode);
  const printerName = preferences.auto_print_printer_name;

  if (!deviceMode) return { ok: false, reason: 'not-configured' };
  if (deviceMode === 'browser-dialog') return { ok: false, reason: 'browser-dialog' };
  if ((deviceMode === 'qz' || deviceMode === 'revgenai-agent') && !printerName) {
    return { ok: false, reason: 'no-printer' };
  }

  try {
    if ((deviceMode === 'web-usb' || deviceMode === 'web-bluetooth') && thermal) {
      const receipt = buildReceipt();
      if (!receipt) return { ok: false, reason: 'transport-failed', detail: 'nothing to print' };
      const commands = buildReceiptCommands(receipt.business, receipt.data, paperSize as ThermalPaperSize);
      if (deviceMode === 'web-usb') await webUsbPrinter.printRaw(commands);
      else await webBluetoothPrinter.printRaw(commands);
      return { ok: true };
    }
    if (deviceMode === 'qz' && printerName) {
      if (thermal) {
        const receipt = buildReceipt();
        if (!receipt) return { ok: false, reason: 'transport-failed', detail: 'nothing to print' };
        await qzTray.printRaw(printerName, buildReceiptCommands(receipt.business, receipt.data, paperSize as ThermalPaperSize));
      } else {
        await qzTray.printPdf(printerName, await getPdf());
      }
      return { ok: true };
    }
    if (deviceMode === 'revgenai-agent' && printerName) {
      if (thermal) {
        const receipt = buildReceipt();
        if (!receipt) return { ok: false, reason: 'transport-failed', detail: 'nothing to print' };
        await printAgentClient.printThermal(printerName, receipt.business, receipt.data, paperSize as ThermalPaperSize);
      } else {
        await printAgentClient.printPdf(printerName, await getPdf());
      }
      return { ok: true };
    }
  } catch (err) {
    console.warn(`Silent print via ${deviceMode} failed, falling back to the print preview:`, err);
    return { ok: false, reason: 'transport-failed', detail: err instanceof Error ? err.message : undefined };
  }

  // A device-bound transport (Web USB/Bluetooth) paired for receipts, asked to print a
  // non-thermal document it has no raw path for.
  return { ok: false, reason: 'non-thermal-preview' };
}

/** Prints an existing, saved invoice via whichever transport is configured — the Invoices list's
 * row "Print" action, or any other manual reprint of a real invoice. Resolves `{ok: true}` if it
 * printed silently (caller should NOT open a tab); otherwise the reason to report before the
 * caller falls back to the print-preview tab. */
export async function printInvoiceSilently(invoiceId: string): Promise<SilentPrintResult> {
  const [invoice, ctx] = await Promise.all([posApi.getInvoice(invoiceId), loadPrintContext()]);
  const paperSize = ctx.settings.auto_print_paper_size;
  const thermal = isThermalPaperSize(paperSize);
  const logoCommand =
    thermal && ctx.template?.config.branding.show_logo && ctx.settings.logo_url
      ? await buildLogoCommand(ctx.settings.logo_url, paperSize)
      : null;
  return dispatchSilentPrint(
    thermal,
    () => buildInvoiceReceiptPayload(invoice, ctx, logoCommand),
    paperSize,
    () => posApi.downloadInvoicePdf(invoiceId),
  );
}

/** Prints the current cart's Provisional/Order Bill preview — POS's "Print Order Bill" button.
 * There is no saved invoice to fetch a PDF for, so a non-thermal (A4/A5/Letter/Legal) default
 * paper size simply can't be silently printed here — that reports 'non-thermal-preview', so the
 * caller falls back to the print-preview tab without claiming anything went wrong. */
export async function printProvisionalBillSilently(snapshot: ProvisionalBillSnapshot): Promise<SilentPrintResult> {
  const ctx = await loadPrintContext();
  const paperSize = ctx.settings.auto_print_paper_size;
  const thermal = isThermalPaperSize(paperSize);
  if (!thermal) return { ok: false, reason: 'non-thermal-preview' };
  const logoCommand =
    ctx.template?.config.branding.show_logo && ctx.settings.logo_url ? await buildLogoCommand(ctx.settings.logo_url, paperSize) : null;
  return dispatchSilentPrint(
    true,
    () => buildProvisionalReceiptPayload(snapshot, ctx, logoCommand),
    paperSize,
    () => {
      throw new Error('unreachable: provisional bills never take the PDF path');
    },
  );
}
