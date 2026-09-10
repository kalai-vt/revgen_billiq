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
import type { Tenant } from '@/features/auth/api';
import * as qzTray from '@/lib/printing/qzTray';
import * as printAgentClient from '@/lib/printing/printAgentClient';
import * as webUsbPrinter from '@/lib/printing/webUsbPrinter';
import * as webBluetoothPrinter from '@/lib/printing/webBluetoothPrinter';
import { loadDeviceMode } from '@/lib/printing/deviceProfile';
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
  if (config?.qr_barcode.payment_qr) {
    qrCodes.push({ caption: 'Scan to Pay', data: `upi://pay?pn=${companyName}&am=${invoice.total_amount.toFixed(2)}` });
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
  if (config?.qr_barcode.payment_qr) {
    qrCodes.push({ caption: 'Scan to Pay', data: `upi://pay?pn=${companyName}&am=${snapshot.total.toFixed(2)}` });
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

/** The actual dispatch: tries whichever transport Settings > Automatic Printing has configured
 * for this device, returns whether it succeeded. Callers fall back to opening the print-preview
 * tab themselves when this returns false — this function never does that itself, since "no
 * printer configured" and "print failed" both just mean "the caller should fall back", and the
 * caller is what knows which URL to open. */
async function dispatchSilentPrint(
  thermal: boolean,
  buildReceipt: () => { business: ReceiptBusinessInfo; data: ReceiptData } | null,
  paperSize: AutoPrintPaperSize,
  getPdf: () => Promise<Blob>,
): Promise<boolean> {
  const deviceMode = loadDeviceMode();
  const preferences = await settingsApi.getBusinessPreferences();
  const printerName = preferences.auto_print_printer_name;

  try {
    if ((deviceMode === 'web-usb' || deviceMode === 'web-bluetooth') && thermal) {
      const receipt = buildReceipt();
      if (!receipt) return false;
      const commands = buildReceiptCommands(receipt.business, receipt.data, paperSize as ThermalPaperSize);
      if (deviceMode === 'web-usb') await webUsbPrinter.printRaw(commands);
      else await webBluetoothPrinter.printRaw(commands);
      return true;
    }
    if (deviceMode === 'qz' && printerName) {
      if (thermal) {
        const receipt = buildReceipt();
        if (!receipt) return false;
        await qzTray.printRaw(printerName, buildReceiptCommands(receipt.business, receipt.data, paperSize as ThermalPaperSize));
      } else {
        await qzTray.printPdf(printerName, await getPdf());
      }
      return true;
    }
    if (deviceMode === 'revgenai-agent' && printerName) {
      if (thermal) {
        const receipt = buildReceipt();
        if (!receipt) return false;
        await printAgentClient.printThermal(printerName, receipt.business, receipt.data, paperSize as ThermalPaperSize);
      } else {
        await printAgentClient.printPdf(printerName, await getPdf());
      }
      return true;
    }
  } catch (err) {
    console.warn(`Silent print via ${deviceMode} failed, falling back to the print preview:`, err);
    return false;
  }
  return false;
}

/** Prints an existing, saved invoice via whichever transport is configured — the Invoices list's
 * row "Print" action, or any other manual reprint of a real invoice. Resolves `true` if it printed
 * silently (caller should NOT open a tab); `false` means fall back to the print-preview tab. */
export async function printInvoiceSilently(invoiceId: string): Promise<boolean> {
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
 * paper size simply can't be silently printed here — this correctly returns `false` in that case,
 * same as "print failed", so the caller falls back to the existing print-preview tab. */
export async function printProvisionalBillSilently(snapshot: ProvisionalBillSnapshot): Promise<boolean> {
  const ctx = await loadPrintContext();
  const paperSize = ctx.settings.auto_print_paper_size;
  const thermal = isThermalPaperSize(paperSize);
  if (!thermal) return false;
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
