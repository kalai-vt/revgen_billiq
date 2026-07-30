/** ESC/POS command + receipt builder for silent thermal printing via QZ Tray (see qzTray.ts,
 * printRaw). Produces plain command/text fragments — QZ Tray sends string array items to the
 * printer as raw bytes with no rendering step, so the same output works identically whether the
 * printer is attached over USB, LAN/WiFi, or Bluetooth. */

const ESC = '\x1B';
const GS = '\x1D';

export type ThermalPaperSize = '58mm' | '80mm';

// Standard Font-A character width for commodity thermal printers at each paper size.
const CHARS_PER_LINE: Record<ThermalPaperSize, number> = {
  '58mm': 32,
  '80mm': 48,
};

function init(): string {
  return `${ESC}@`;
}
function align(pos: 'left' | 'center' | 'right'): string {
  return `${ESC}a${pos === 'left' ? '\x00' : pos === 'center' ? '\x01' : '\x02'}`;
}
function bold(on: boolean): string {
  return `${ESC}E${on ? '\x01' : '\x00'}`;
}
function doubleSize(on: boolean): string {
  return `${GS}!${on ? '\x11' : '\x00'}`;
}
function feed(lines: number): string {
  return `${ESC}d${String.fromCharCode(lines)}`;
}
function cut(): string {
  return `${GS}V\x01`;
}
function divider(width: number): string {
  return `${'-'.repeat(width)}\n`;
}

const QR_ERROR_CORRECTION = { L: 48, M: 49, Q: 50, H: 51 } as const;

/** Standard ESC/POS "GS ( k" QR code sequence (select model 2 → set module size → set error
 * correction → store data → print), supported across most modern ESC/POS thermal printers —
 * renders the QR on the printer itself, no bitmap/image library needed. `data` is written as raw
 * bytes (QR byte mode), same convention as the rest of this file. */
function qrCode(data: string, moduleSize = 6, errorCorrection: keyof typeof QR_ERROR_CORRECTION = 'M'): string {
  const GSk = `${GS}(k`;
  const selectModel = `${GSk}\x04\x00\x31\x41\x32\x00`;
  const setSize = `${GSk}\x03\x00\x31\x43${String.fromCharCode(moduleSize)}`;
  const setErrorCorrection = `${GSk}\x03\x00\x31\x45${String.fromCharCode(QR_ERROR_CORRECTION[errorCorrection])}`;
  const storeLength = data.length + 3;
  const storeData = `${GSk}${String.fromCharCode(storeLength & 0xff)}${String.fromCharCode((storeLength >> 8) & 0xff)}\x31\x50\x30${data}`;
  const printSymbol = `${GSk}\x03\x00\x31\x51\x30`;
  return selectModel + setSize + setErrorCorrection + storeData + printSymbol;
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) lines.push(current);
      current = word.length > width ? word.slice(0, width) : word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function twoCol(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length);
  return `${left}${' '.repeat(gap)}${right}\n`;
}

export interface ReceiptBusinessInfo {
  companyName: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  gstNumber?: string | null;
  /** Only passed when the tenant's Invoice Designer template has branding.show_phone enabled —
   * see InvoiceSuccessDialog.tsx. */
  phone?: string | null;
  /** Pre-rendered ESC/POS raster bit-image command for the tenant's logo — see
   * `escposLogo.ts::buildLogoCommand`. Built separately (it's async; loads and rasterizes an
   * image) and passed in already-built, so this function itself stays synchronous. */
  logoCommand?: string | null;
}

export interface ReceiptFooterSection {
  text: string;
}

export interface ReceiptQrCode {
  caption: string;
  data: string;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ReceiptData {
  invoiceNumber: string;
  createdAt: string;
  cashierName: string;
  customerName?: string | null;
  customerPhone?: string | null;
  items: ReceiptItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxPercentage: number;
  totalAmount: number;
  paymentMethod: string;
  amountTendered?: number | null;
  changeDue?: number | null;
  footer?: string | null;
  currency: string;
  decimalPrecision: number;
  /** From the tenant's Invoice Designer tax_summary.fields.round_off toggle — always 0 for
   * regular invoices today (see backend document_data.py), but a real, tenant-enabled line item
   * rather than a fabricated one, so it's shown when enabled for parity with the on-screen/PDF
   * receipt. */
  roundOff?: number;
  /** Enabled sections from the Designer template's footer.sections, already filtered/ordered by
   * the caller. Printed before the legacy single `footer` string above, so tenants using either
   * or both fields see everything they've configured. */
  footerSections?: ReceiptFooterSection[];
  /** Enabled QR codes from the Designer template's qr_barcode.* flags, already built by the
   * caller (see InvoiceSuccessDialog.tsx for the exact payload per QR type). */
  qrCodes?: ReceiptQrCode[];
}

function money(value: number, data: ReceiptData): string {
  const prefix = data.currency === 'INR' ? 'Rs.' : `${data.currency} `;
  return `${prefix}${value.toFixed(data.decimalPrecision)}`;
}

/** Builds the ordered list of ESC/POS command/text fragments for a full receipt, sized to the
 * given thermal paper width. Pass the result straight to `qzTray.printRaw`. */
export function buildReceiptCommands(
  business: ReceiptBusinessInfo,
  data: ReceiptData,
  paperSize: ThermalPaperSize,
): string[] {
  const width = CHARS_PER_LINE[paperSize];
  const out: string[] = [];
  const createdAt = new Date(data.createdAt);

  out.push(init());
  if (business.logoCommand) {
    out.push(align('center'), business.logoCommand, feed(1));
  }
  out.push(align('center'), bold(true), doubleSize(true));
  out.push(`${business.companyName}\n`);
  out.push(doubleSize(false), bold(false));

  const addressLines = [
    business.addressLine1,
    [business.addressLine2, business.city, business.state, business.pincode].filter(Boolean).join(', '),
    business.gstNumber ? `GSTIN: ${business.gstNumber}` : null,
    business.phone ? `Ph: ${business.phone}` : null,
  ].filter((line): line is string => Boolean(line && line.trim()));
  for (const line of addressLines) {
    for (const wrapped of wrapText(line, width)) out.push(`${wrapped}\n`);
  }

  out.push(align('left'), divider(width));
  out.push(twoCol(`Bill: ${data.invoiceNumber}`, createdAt.toLocaleDateString(), width));
  out.push(`${createdAt.toLocaleTimeString()}\n`);
  out.push(`Cashier: ${data.cashierName}\n`);
  if (data.customerName) {
    out.push(`Customer: ${data.customerName}${data.customerPhone ? ` (${data.customerPhone})` : ''}\n`);
  }
  out.push(divider(width));

  for (const item of data.items) {
    for (const wrapped of wrapText(item.name, width)) out.push(`${wrapped}\n`);
    out.push(
      twoCol(`  ${item.quantity} x ${item.unitPrice.toFixed(data.decimalPrecision)}`, money(item.lineTotal, data), width),
    );
  }
  out.push(divider(width));

  out.push(twoCol('Subtotal', money(data.subtotal, data), width));
  if (data.discountAmount > 0) out.push(twoCol('Discount', `-${money(data.discountAmount, data)}`, width));
  if (data.taxAmount > 0) out.push(twoCol(`Tax (${data.taxPercentage}%)`, money(data.taxAmount, data), width));
  if (data.roundOff != null) out.push(twoCol('Round Off', money(data.roundOff, data), width));
  out.push(bold(true));
  out.push(twoCol('TOTAL', money(data.totalAmount, data), width));
  out.push(bold(false));
  out.push(`Payment: ${data.paymentMethod.toUpperCase()}\n`);
  if (data.amountTendered != null) out.push(twoCol('Tendered', money(data.amountTendered, data), width));
  if (data.changeDue != null && data.changeDue > 0) out.push(twoCol('Change', money(data.changeDue, data), width));

  const footerLines = [
    ...(data.footerSections ?? []).map((section) => section.text),
    data.footer,
  ].filter((text): text is string => Boolean(text && text.trim()));
  if (footerLines.length > 0) {
    out.push(divider(width), align('center'));
    for (const text of footerLines) {
      for (const wrapped of wrapText(text, width)) out.push(`${wrapped}\n`);
    }
  }

  if (data.qrCodes && data.qrCodes.length > 0) {
    out.push(align('center'));
    for (const { caption, data: qrData } of data.qrCodes) {
      out.push(feed(1), `${caption}\n`, qrCode(qrData), feed(1));
    }
  }

  out.push(feed(3), cut());
  return out;
}
