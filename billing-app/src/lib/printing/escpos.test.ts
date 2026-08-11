import { describe, expect, it } from 'vitest';
import { buildReceiptCommands, buildTestPrintCommands, type ReceiptBusinessInfo, type ReceiptData } from '@/lib/printing/escpos';

const CHARS_PER_LINE = { '58mm': 32, '80mm': 48 } as const;

const business: ReceiptBusinessInfo = { companyName: 'Acme Retail' };

function baseData(promotion: ReceiptData['promotion']): ReceiptData {
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
    promotion,
  };
}

/** Plain printed text lines end with \n and never start with an ESC/GS control byte — command
 * fragments (align/bold/qrCode/etc.) are excluded by this filter, isolating exactly the
 * wrapped-text output that must respect the paper's character width. */
function textLines(commands: string[]): string[] {
  return commands
    .filter((c) => c.endsWith('\n') && !c.startsWith('\x1B') && !c.startsWith('\x1D'))
    .flatMap((c) => c.split('\n').filter(Boolean));
}

describe('buildReceiptCommands — BillIQ Promotion block', () => {
  it('omits the promotion block entirely when promotion is null', () => {
    const commands = buildReceiptCommands(business, baseData(null), '80mm');
    expect(commands.join('')).not.toContain('RevGenAI');
  });

  it('includes title/description/website/phone when promotion is set', () => {
    const commands = buildReceiptCommands(
      business,
      baseData({ title: 'Powered by RevGenAI BillIQ', description: 'Smart Billing for Business', website: 'revgenai.in/billiq', phone: '8680844026' }),
      '80mm',
    );
    const joined = commands.join('');
    expect(joined).toContain('Powered by RevGenAI BillIQ');
    expect(joined).toContain('Smart Billing for Business');
    expect(joined).toContain('revgenai.in/billiq');
    expect(joined).toContain('8680844026');
  });

  it('emits a QR command only when qrUrl is provided', () => {
    const withQr = buildReceiptCommands(
      business,
      baseData({ title: 'Powered by RevGenAI BillIQ', description: 'x', website: 'x', phone: 'x', qrUrl: 'https://revgenai.in/api/v1/promotion/r?t=abc' }),
      '80mm',
    );
    const withoutQr = buildReceiptCommands(
      business,
      baseData({ title: 'Powered by RevGenAI BillIQ', description: 'x', website: 'x', phone: 'x', qrUrl: null }),
      '80mm',
    );
    // GS ( k is the QR command prefix (see qrCode() in escpos.ts) — its presence is the only
    // reliable signal here since the raw QR payload bytes aren't human-readable text.
    expect(withQr.join('')).toContain('\x1D(k');
    expect(withoutQr.join('')).not.toContain('\x1D(k');
  });

  it.each(['58mm', '80mm'] as const)(
    'wraps a long title/description within the %s character width, never overflowing',
    (paperSize) => {
      const commands = buildReceiptCommands(
        business,
        baseData({
          title: 'Powered by RevGenAI BillIQ — Smart Billing, Inventory, and Analytics for Growing Businesses',
          description: 'Simplify your billing and business operations end to end with a single connected platform',
          website: 'revgenai.in/billiq',
          phone: '8680844026',
        }),
        paperSize,
      );
      const width = CHARS_PER_LINE[paperSize];
      for (const line of textLines(commands)) {
        expect(line.length).toBeLessThanOrEqual(width);
      }
    },
  );

  it('prints the promotion block after the footer, not before it', () => {
    const commands = buildReceiptCommands(
      business,
      { ...baseData({ title: 'Powered by RevGenAI BillIQ', description: 'x', website: 'x', phone: 'x' }), footer: 'Thanks for shopping!' },
      '80mm',
    );
    const joined = commands.join('');
    expect(joined.indexOf('Thanks for shopping!')).toBeLessThan(joined.indexOf('Powered by RevGenAI BillIQ'));
  });
});

describe('buildTestPrintCommands', () => {
  it.each(['58mm', '80mm'] as const)('contains no invoice/amount/customer data for %s', (paperSize) => {
    const joined = buildTestPrintCommands(paperSize).join('');
    expect(joined).toContain('RevGen BillIQ');
    expect(joined).toContain('Printer Test');
    expect(joined).toContain('Printer connection successful');
    expect(joined).toContain(paperSize);
    // No invoice/amount/customer fields — a test print must never resemble a real transaction.
    expect(joined).not.toMatch(/Rs\.|₹|INV-|Customer|Total/i);
  });

  it.each(['58mm', '80mm'] as const)('respects the %s character width', (paperSize) => {
    const width = CHARS_PER_LINE[paperSize];
    const lines = buildTestPrintCommands(paperSize)
      .filter((c) => c.endsWith('\n') && !c.startsWith('\x1B') && !c.startsWith('\x1D'))
      .flatMap((c) => c.split('\n').filter(Boolean));
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(width);
    }
  });

  it('ends with a cut command, same as a real receipt', () => {
    const commands = buildTestPrintCommands('80mm');
    expect(commands.join('')).toContain('\x1DV\x01');
  });
});
