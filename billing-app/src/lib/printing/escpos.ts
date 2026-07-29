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

  out.push(init(), align('center'), bold(true), doubleSize(true));
  out.push(`${business.companyName}\n`);
  out.push(doubleSize(false), bold(false));

  const addressLines = [
    business.addressLine1,
    [business.addressLine2, business.city, business.state, business.pincode].filter(Boolean).join(', '),
    business.gstNumber ? `GSTIN: ${business.gstNumber}` : null,
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
  out.push(bold(true));
  out.push(twoCol('TOTAL', money(data.totalAmount, data), width));
  out.push(bold(false));
  out.push(`Payment: ${data.paymentMethod.toUpperCase()}\n`);
  if (data.amountTendered != null) out.push(twoCol('Tendered', money(data.amountTendered, data), width));
  if (data.changeDue != null && data.changeDue > 0) out.push(twoCol('Change', money(data.changeDue, data), width));

  if (data.footer && data.footer.trim()) {
    out.push(divider(width), align('center'));
    for (const wrapped of wrapText(data.footer, width)) out.push(`${wrapped}\n`);
  }

  out.push(feed(3), cut());
  return out;
}
