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

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function underThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) return (TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '')).trim();
  return (ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ` and ${underThousand(n % 100)}` : '')).trim();
}

function integerToWordsIndian(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1_000);
  n %= 1_000;
  if (crore) parts.push(`${underThousand(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (n) parts.push(underThousand(n));
  return parts.join(' ');
}

/** Ports `backend/app/modules/invoice_designer/amount_words.py::amount_in_words_inr` so the
 * "Amount in Words" line reads identically whether it came from the thermal or PDF path — Indian
 * numbering (lakh/crore) regardless of tenant currency, matching that function's own tradeoff. */
export function numberToWordsInr(amount: number, currencyLabel = 'Rupees'): string {
  const rupees = Math.trunc(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = `${currencyLabel} ${integerToWordsIndian(rupees)}`;
  if (paise) words += ` and ${underThousand(paise)} Paise`;
  return `${words} Only`;
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

/** Mirrors the checkbox fields under Invoice Designer's Invoice Info / Customer Details / Tax &
 * Summary sections (`InvoiceInfoConfig.fields`, `CustomerDetailsConfig.fields`,
 * `TaxSummaryConfig.fields`) — every field here has real backing data on `Invoice`; fields with
 * no backing data anywhere in the system (counter, order_number, customer email/address,
 * cess/shipping/packing — see escpos.ts's module comment) aren't represented here since there's
 * nothing to gate. Defaults to all-`true` when omitted, matching this file's pre-toggle behavior. */
export interface ReceiptFieldVisibility {
  invoiceNumber: boolean;
  date: boolean;
  time: boolean;
  dueDate: boolean;
  cashier: boolean;
  customerId: boolean;
  paymentMethod: boolean;
  paymentStatus: boolean;
  invoiceStatus: boolean;
  customerName: boolean;
  customerMobile: boolean;
  customerGstin: boolean;
  subtotal: boolean;
  discount: boolean;
  grandTotal: boolean;
  paid: boolean;
  outstanding: boolean;
  amountInWords: boolean;
}

const DEFAULT_VISIBILITY: ReceiptFieldVisibility = {
  invoiceNumber: true,
  date: true,
  time: true,
  dueDate: true,
  cashier: true,
  customerId: true,
  paymentMethod: true,
  paymentStatus: true,
  invoiceStatus: true,
  customerName: true,
  customerMobile: true,
  customerGstin: true,
  subtotal: true,
  discount: true,
  grandTotal: true,
  paid: true,
  outstanding: true,
  amountInWords: true,
};

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
  dueDate?: string | null;
  customerId?: string | null;
  /** Already formatted ("Partially Paid", "Paid" — title-cased, underscores replaced), matching
   * backend document_data.py's own formatting so thermal/PDF read identically. */
  paymentStatus?: string | null;
  invoiceStatus?: string | null;
  /** Same value as `ReceiptBusinessInfo.gstNumber` — the backend's own document_data.py labels
   * this "customer_gstin" but sources it from the business's own GST snapshot on the invoice
   * (there's no separate customer-GSTIN concept in the data model); kept faithful to that
   * existing PDF behavior rather than diverging on thermal. */
  customerGstin?: string | null;
  paidAmount?: number | null;
  outstandingAmount?: number | null;
  /** CGST/SGST/IGST are a derived 50/50 (or full) split of the single stored `taxAmount`, not a
   * real stored breakdown — same convention backend document_data.py already uses. When any of
   * these are present, they replace the combined "Tax (X%)" line. */
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  amountInWords?: string | null;
  visibility?: Partial<ReceiptFieldVisibility>;
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
  const v: ReceiptFieldVisibility = { ...DEFAULT_VISIBILITY, ...data.visibility };

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
  if (v.invoiceNumber || v.date) {
    out.push(twoCol(v.invoiceNumber ? `Bill: ${data.invoiceNumber}` : '', v.date ? createdAt.toLocaleDateString() : '', width));
  }
  if (v.time) out.push(`${createdAt.toLocaleTimeString()}\n`);
  if (v.dueDate && data.dueDate) out.push(`Due: ${new Date(data.dueDate).toLocaleDateString()}\n`);
  if (v.cashier) out.push(`Cashier: ${data.cashierName}\n`);
  if (v.customerId && data.customerId) out.push(`Customer ID: ${data.customerId}\n`);
  {
    const name = v.customerName ? data.customerName : null;
    const phone = v.customerMobile ? data.customerPhone : null;
    if (name || phone) out.push(`Customer: ${[name, phone ? `(${phone})` : null].filter(Boolean).join(' ')}\n`);
  }
  if (v.customerGstin && data.customerGstin) out.push(`Customer GSTIN: ${data.customerGstin}\n`);
  if (v.paymentStatus && data.paymentStatus) out.push(`Payment Status: ${data.paymentStatus}\n`);
  if (v.invoiceStatus && data.invoiceStatus) out.push(`Status: ${data.invoiceStatus}\n`);
  out.push(divider(width));

  for (const item of data.items) {
    for (const wrapped of wrapText(item.name, width)) out.push(`${wrapped}\n`);
    out.push(
      twoCol(`  ${item.quantity} x ${item.unitPrice.toFixed(data.decimalPrecision)}`, money(item.lineTotal, data), width),
    );
  }
  out.push(divider(width));

  if (v.subtotal) out.push(twoCol('Subtotal', money(data.subtotal, data), width));
  if (v.discount && data.discountAmount > 0) out.push(twoCol('Discount', `-${money(data.discountAmount, data)}`, width));

  const hasGstSplit = data.cgst != null || data.sgst != null || data.igst != null;
  if (hasGstSplit) {
    if (data.cgst != null) out.push(twoCol('CGST', money(data.cgst, data), width));
    if (data.sgst != null) out.push(twoCol('SGST', money(data.sgst, data), width));
    if (data.igst != null) out.push(twoCol('IGST', money(data.igst, data), width));
  } else if (data.taxAmount > 0) {
    out.push(twoCol(`Tax (${data.taxPercentage}%)`, money(data.taxAmount, data), width));
  }

  if (data.roundOff != null) out.push(twoCol('Round Off', money(data.roundOff, data), width));
  if (v.grandTotal) {
    out.push(bold(true));
    out.push(twoCol('TOTAL', money(data.totalAmount, data), width));
    out.push(bold(false));
  }
  if (v.paymentMethod) out.push(`Payment: ${data.paymentMethod.toUpperCase()}\n`);
  if (data.amountTendered != null) out.push(twoCol('Tendered', money(data.amountTendered, data), width));
  if (data.changeDue != null && data.changeDue > 0) out.push(twoCol('Change', money(data.changeDue, data), width));
  if (v.paid && data.paidAmount != null) out.push(twoCol('Paid', money(data.paidAmount, data), width));
  if (v.outstanding && data.outstandingAmount != null && data.outstandingAmount > 0) {
    out.push(twoCol('Outstanding', money(data.outstandingAmount, data), width));
  }
  if (v.amountInWords && data.amountInWords) {
    for (const wrapped of wrapText(data.amountInWords, width)) out.push(`${wrapped}\n`);
  }

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
