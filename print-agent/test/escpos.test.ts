import { describe, expect, it } from 'vitest';
import { barcode, buildReceiptCommands, buildTestPrintCommands, cashDrawerPulse, toBytes, type ReceiptBusinessInfo, type ReceiptData } from '../src/renderer/escpos.js';

const business: ReceiptBusinessInfo = { companyName: 'Acme Retail' };

function baseData(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    invoiceNumber: 'INV-1',
    createdAt: '2026-08-08T10:30:00.000Z',
    cashierName: 'Ada',
    items: [{ name: 'Widget', quantity: 1, unitPrice: 100, lineTotal: 100 }],
    subtotal: 100,
    discountAmount: 0,
    taxAmount: 0,
    taxPercentage: 0,
    totalAmount: 100,
    paymentMethod: 'cash',
    currency: 'INR',
    decimalPrecision: 2,
    ...overrides,
  };
}

describe('buildReceiptCommands — ported baseline behaviour', () => {
  it('renders the company name and total for a plain receipt', () => {
    const joined = buildReceiptCommands(business, baseData(), '80mm').join('');
    expect(joined).toContain('Acme Retail');
    expect(joined).toContain('TOTAL');
    expect(joined).toContain('Rs.100.00');
  });

  it('wraps long lines to the paper width (58mm = 32 chars)', () => {
    const commands = buildReceiptCommands(business, baseData({ items: [{ name: 'A'.repeat(50), quantity: 1, unitPrice: 1, lineTotal: 1 }] }), '58mm');
    const textLines = commands.filter((c) => c.endsWith('\n') && !c.startsWith('\x1B') && !c.startsWith('\x1D')).flatMap((c) => c.split('\n').filter(Boolean));
    for (const line of textLines) expect(line.length).toBeLessThanOrEqual(32);
  });
});

describe('cashDrawerPulse — new vs billing-app source', () => {
  it('is only appended when openCashDrawer is set on the receipt data', () => {
    const without = buildReceiptCommands(business, baseData(), '80mm').join('');
    const withDrawer = buildReceiptCommands(business, baseData({ openCashDrawer: true }), '80mm').join('');
    expect(without).not.toContain('\x1Bp');
    expect(withDrawer).toContain('\x1Bp');
  });

  it('emits the documented ESC p m t1 t2 sequence (pin 2, ~100ms on / ~250ms off)', () => {
    const pulse = cashDrawerPulse();
    expect(pulse).toBe('\x1Bp\x00\x32\x7d');
  });
});

describe('barcode — new vs billing-app source', () => {
  it('emits a GS k command carrying the given data', () => {
    const command = barcode('0123456789', 'CODE128');
    expect(command).toContain('\x1Dk');
    expect(command).toContain('0123456789');
  });

  it('is appended to the receipt only when barcodes are provided', () => {
    const commands = buildReceiptCommands(
      business,
      baseData({ barcodes: [{ caption: 'SKU', data: '0123456789', symbology: 'CODE128' }] }),
      '80mm',
    );
    expect(commands.join('')).toContain('SKU');
  });
});

describe('toBytes', () => {
  it('produces one byte per character, matching char codes exactly', () => {
    const bytes = toBytes(['AB', '\x1B@']);
    expect(Array.from(bytes)).toEqual([0x41, 0x42, 0x1b, 0x40]);
  });
});

describe('buildTestPrintCommands', () => {
  it('never includes invoice/amount data of any kind', () => {
    const joined = buildTestPrintCommands('80mm').join('');
    expect(joined).not.toMatch(/Rs\.|INV-|Total/i);
    expect(joined).toContain('Printer connection successful');
  });
});
