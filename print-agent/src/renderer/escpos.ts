/** ESC/POS command + receipt builder — ported from `billing-app/src/lib/printing/escpos.ts` so
 * the agent renders byte-for-byte the same receipt layout BillIQ already relies on, then extended
 * with the two commands that file never needed while QZ Tray/Web USB/Web Bluetooth were the only
 * transports and no adapter exposed cash-drawer or barcode support: `cashDrawerPulse` and
 * `barcode`. Every other command (init, align, bold, double-size, QR, dividers, wrapping) is kept
 * identical to the source so a tenant's printed receipt looks the same regardless of which
 * transport (QZ vs this agent) produced it during the migration window. */

const ESC = '\x1B';
const GS = '\x1D';

export type ThermalPaperSize = '58mm' | '80mm';
// Decoupled from billing-app's invoice-designer FontSizeChoice type (this renderer has no
// business-feature imports) but uses the same 'sm'|'md'|'lg' vocabulary by convention — kept in
// sync with billing-app/src/lib/printing/escpos.ts's own copy of this type.
export type TextSizeChoice = 'sm' | 'md' | 'lg';

// Standard Font-A character width for commodity thermal printers at each paper size — same table
// as billing-app's escpos.ts; keep these two in sync if either changes.
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
// GS ! n — n's low nibble is the height multiplier minus 1, high nibble is the width multiplier
// minus 1 (both 0-7, i.e. 1x-8x). `mult` scales both axes equally. 2 (0x11) is what this file
// always sent for the business-name header before per-template sizing existed — kept as the "md"
// default so existing templates print unchanged. Kept in sync with billing-app's own copy.
function textSize(mult: 1 | 2 | 3): string {
  const nibble = mult - 1;
  return `${GS}!${String.fromCharCode((nibble << 4) | nibble)}`;
}
const BUSINESS_NAME_SIZE_MULT: Record<TextSizeChoice, 1 | 2 | 3> = { sm: 1, md: 2, lg: 3 };
// Literal newline characters, not the `ESC d n` control sequence — confirmed on real hardware
// (a generic/clone 58mm printer, TECH CLA58 chipset) that `ESC d` is not reliably honored: raising
// its line count 3→5→8 kept under-feeding, while switching to plain `\n` characters (which every
// ESC/POS-compatible firmware must support, since they're normal printable-line advances rather
// than a control command some clones only partially implement) behaved exactly as expected at
// every tested value. `\n` is guaranteed to work everywhere `ESC d` might silently be a no-op.
function feed(lines: number): string {
  return '\n'.repeat(lines);
}
function cut(): string {
  return `${GS}V\x01`;
}
function divider(width: number): string {
  return `${'-'.repeat(width)}\n`;
}

/** ESC p m t1 t2 — fires the drawer-kick pulse on pin 2 (m=0, the near-universal default) for
 * 100ms on / 250ms off (t1/t2 in 2ms units: 50*2=100, 125*2=250), the standard values every
 * ESC/POS cash-drawer wiring guide recommends. Not present in billing-app's escpos.ts because no
 * transport there had a drawer-kick UI action to call it from (spec §8/§17's "Open Cash Drawer"). */
export function cashDrawerPulse(pin: 0 | 1 = 0): string {
  return `${ESC}p${String.fromCharCode(pin)}\x32\x7d`;
}

const BARCODE_HRI_BELOW = `${GS}H\x02`;
const BARCODE_HEIGHT = (dots: number) => `${GS}h${String.fromCharCode(dots)}`;
const BARCODE_WIDTH = (module: number) => `${GS}w${String.fromCharCode(module)}`;

export type BarcodeSymbology = 'CODE128' | 'CODE39' | 'EAN13';

// GS k m d1...dk NUL — symbology selector byte per the ESC/POS spec's "function type A" table.
const BARCODE_SYMBOLOGY_CODE: Record<BarcodeSymbology, number> = {
  CODE39: 4,
  EAN13: 2,
  CODE128: 73,
};

/** Renders a 1D barcode via `GS k` — not present in billing-app's escpos.ts (which only ever
 * needed QR, since barcode scanning in BillIQ is input-side, on the POS product-search panel, not
 * something a receipt prints). CODE128 needs its data prefixed with a code-set selector (`{B` for
 * the common all-ASCII case) per the spec; CODE39/EAN13 take the raw digits/text directly. */
export function barcode(data: string, symbology: BarcodeSymbology = 'CODE128', height = 80, moduleWidth = 2): string {
  const payload = symbology === 'CODE128' ? `{B${data}` : data;
  const header = BARCODE_HRI_BELOW + BARCODE_HEIGHT(height) + BARCODE_WIDTH(moduleWidth);
  const command = `${GS}k${String.fromCharCode(BARCODE_SYMBOLOGY_CODE[symbology])}${String.fromCharCode(payload.length)}${payload}`;
  return header + command;
}

const QR_ERROR_CORRECTION = { L: 48, M: 49, Q: 50, H: 51 } as const;

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
  /** From Invoice Designer's branding.business_name_size — defaults to 'md' (the size this file
   * always printed the header at before per-template sizing existed) when unset. */
  companyNameSize?: TextSizeChoice | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  gstNumber?: string | null;
  phone?: string | null;
  logoCommand?: string | null;
}

export interface ReceiptFooterSection {
  text: string;
}

export interface ReceiptQrCode {
  caption: string;
  data: string;
}

export interface ReceiptBarcode {
  caption: string;
  data: string;
  symbology: BarcodeSymbology;
}

export interface ReceiptPromotion {
  title: string;
  description?: string | null;
  website: string;
  phone: string;
  qrUrl?: string | null;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

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
  roundOff?: number;
  footerSections?: ReceiptFooterSection[];
  qrCodes?: ReceiptQrCode[];
  /** New vs. billing-app's escpos.ts — thermal barcode printing (spec §8), independent of the
   * customer-facing product barcode scanning already implemented elsewhere in BillIQ. */
  barcodes?: ReceiptBarcode[];
  dueDate?: string | null;
  customerId?: string | null;
  paymentStatus?: string | null;
  invoiceStatus?: string | null;
  customerGstin?: string | null;
  paidAmount?: number | null;
  outstandingAmount?: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  amountInWords?: string | null;
  visibility?: Partial<ReceiptFieldVisibility>;
  promotion?: ReceiptPromotion | null;
  /** Set by the web app when Settings > Automatic Printing has "Open Cash Drawer" enabled for
   * this document type (spec §17). The renderer just appends the pulse; the adapter layer decides
   * whether the target printer's capabilities actually support it (see `getCapabilities`). */
  openCashDrawer?: boolean;
}

function money(value: number, data: ReceiptData): string {
  const prefix = data.currency === 'INR' ? 'Rs.' : `${data.currency} `;
  return `${prefix}${value.toFixed(data.decimalPrecision)}`;
}

/** Builds the ordered list of ESC/POS command/text fragments for a full receipt, sized to the
 * given thermal paper width. Adapters convert this to raw bytes via `toBytes` before writing to
 * USB/network/serial. */
export function buildReceiptCommands(business: ReceiptBusinessInfo, data: ReceiptData, paperSize: ThermalPaperSize): string[] {
  const width = CHARS_PER_LINE[paperSize];
  const out: string[] = [];
  const createdAt = new Date(data.createdAt);
  const v: ReceiptFieldVisibility = { ...DEFAULT_VISIBILITY, ...data.visibility };

  out.push(init());
  if (business.logoCommand) {
    out.push(align('center'), business.logoCommand, feed(1));
  }
  out.push(align('center'), bold(true), textSize(BUSINESS_NAME_SIZE_MULT[business.companyNameSize ?? 'md']));
  out.push(`${business.companyName}\n`);
  out.push(textSize(1), bold(false));

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
    out.push(twoCol(`  ${item.quantity} x ${item.unitPrice.toFixed(data.decimalPrecision)}`, money(item.lineTotal, data), width));
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

  const footerLines = [...(data.footerSections ?? []).map((section) => section.text), data.footer].filter(
    (text): text is string => Boolean(text && text.trim()),
  );
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

  if (data.barcodes && data.barcodes.length > 0) {
    out.push(align('center'));
    for (const { caption, data: barcodeData, symbology } of data.barcodes) {
      out.push(feed(1), `${caption}\n`, barcode(barcodeData, symbology), feed(1));
    }
  }

  if (data.promotion) {
    out.push(divider(width), align('center'), bold(true));
    for (const wrapped of wrapText(data.promotion.title, width)) out.push(`${wrapped}\n`);
    out.push(bold(false));
    if (data.promotion.description) {
      for (const wrapped of wrapText(data.promotion.description, width)) out.push(`${wrapped}\n`);
    }
    for (const wrapped of wrapText(`${data.promotion.website} · ${data.promotion.phone}`, width)) out.push(`${wrapped}\n`);
    if (data.promotion.qrUrl) {
      out.push(feed(1), qrCode(data.promotion.qrUrl, 4), feed(1));
    }
  }

  // Real hardware showed `ESC d n` (the old `feed()` implementation) wasn't reliably feeding the
  // claimed number of lines at all — switching feed() to literal `\n` (see its own comment) is the
  // actual fix. Tuned down from 6 (about 1cm too much) to 4 (still ~0.5cm too much) to 3 on real
  // hardware — each line is roughly 4-5mm at this printer's default line spacing.
  out.push(feed(3), cut());
  if (data.openCashDrawer) out.push(cashDrawerPulse());
  return out;
}

/** A standalone printer/connectivity check for the pairing/Settings "Test Print" action —
 * deliberately independent of ReceiptData/any invoice, matching billing-app's own
 * `buildTestPrintCommands` intent (never mistakable for, or able to create, a real sale record). */
export function buildTestPrintCommands(paperSize: ThermalPaperSize): string[] {
  const width = CHARS_PER_LINE[paperSize];
  const now = new Date();
  const out: string[] = [];
  out.push(init(), align('center'), bold(true), textSize(2));
  out.push('RevGenAI Print Agent\n');
  out.push(textSize(1));
  out.push('Printer Test\n');
  out.push(bold(false));
  out.push(`${paperSize}\n`);
  out.push(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n`);
  out.push(divider(width));
  out.push('Printer connection successful\n');
  out.push(divider(width));
  out.push(feed(3), cut());
  return out;
}

/** Converts command/text fragments (each char code already the intended raw byte) into a single
 * `Uint8Array` for USB/network/serial transports — ported from billing-app's `escposBytes.ts`. */
export function toBytes(commands: string[]): Uint8Array {
  const joined = commands.join('');
  const bytes = new Uint8Array(joined.length);
  for (let i = 0; i < joined.length; i++) {
    bytes[i] = joined.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/** Kitchen Order Ticket — ported from `billing-app/src/lib/printing/escpos.ts::buildKotCommands`
 * on the same principle as buildReceiptCommands above: the agent renders it so the web app never
 * constructs printer-specific bytes, and both renderers stay byte-for-byte identical so a ticket
 * looks the same whether it went out through QZ Tray, WebUSB, or this agent.
 *
 * A KOT deliberately carries no prices, totals or tax — it is a cooking instruction, not a bill.
 */
export interface KotTicketData {
  kotNumber: string;
  orderNumber: string;
  /** Null for takeaway — printed as TAKEAWAY so the kitchen plates it differently. */
  tableName?: string | null;
  orderType: 'dine_in' | 'takeaway';
  createdAt: string;
  /** Reprints must be obvious, or the kitchen cooks the same ticket twice. */
  reprint?: boolean;
  items: { name: string; quantity: number; notes?: string | null }[];
  notes?: string | null;
}

/** Quantities print double-height at the start of the line because this is read at arm's length
 * across a hot pass, not held in the hand like a receipt — the quantity is the single most
 * important thing on the ticket and misreading "1" as "7" wastes food. */
export function buildKotCommands(data: KotTicketData, paperSize: ThermalPaperSize): string[] {
  const width = CHARS_PER_LINE[paperSize];
  const out: string[] = [];
  const createdAt = new Date(data.createdAt);

  out.push(init(), align('center'), bold(true), textSize(2));
  out.push(`${data.kotNumber}\n`);
  out.push(textSize(1));

  if (data.reprint) {
    out.push('*** REPRINT ***\n');
  }
  out.push(bold(false));

  const where = data.orderType === 'takeaway' ? 'TAKEAWAY' : `TABLE ${data.tableName ?? '-'}`;
  out.push(bold(true), textSize(2), `${where}\n`, textSize(1), bold(false));

  out.push(align('left'), divider(width));
  out.push(twoCol(`Order: ${data.orderNumber}`, createdAt.toLocaleTimeString(), width));
  out.push(divider(width));

  for (const item of data.items) {
    // `qty x` leads the line at double width so it reads across the pass; the name wraps under
    // it rather than being truncated, since a cook needs the whole dish name.
    out.push(bold(true), textSize(2));
    out.push(`${item.quantity} x\n`);
    out.push(textSize(1));
    for (const wrapped of wrapText(item.name, width)) out.push(`${wrapped}\n`);
    out.push(bold(false));
    if (item.notes) {
      for (const wrapped of wrapText(`  >> ${item.notes}`, width)) out.push(`${wrapped}\n`);
    }
  }

  out.push(divider(width));
  if (data.notes) {
    for (const wrapped of wrapText(`NOTE: ${data.notes}`, width)) out.push(`${wrapped}\n`);
    out.push(divider(width));
  }

  out.push(feed(3), cut());
  return out;
}
