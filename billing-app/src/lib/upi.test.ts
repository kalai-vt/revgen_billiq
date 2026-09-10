import { describe, expect, it } from 'vitest';
import {
  UpiConfigError,
  buildPaymentQrEntry,
  buildUpiUri,
  isUpiConfigured,
  paymentQrEnabled,
  shouldRenderPaymentQr,
} from '@/lib/upi';

describe('buildUpiUri', () => {
  it('always carries pa, the one field without which no UPI app can pay the link', () => {
    expect(buildUpiUri({ vpa: 'shop@okaxis' })).toContain('pa=shop%40okaxis');
  });

  it('refuses to build a link with no payee rather than emitting an unpayable one', () => {
    expect(() => buildUpiUri({ vpa: null })).toThrow(UpiConfigError);
    expect(() => buildUpiUri({ vpa: '   ' })).toThrow(UpiConfigError);
  });

  it('encodes the amount with its currency for a dynamic QR', () => {
    const uri = buildUpiUri({ vpa: 'shop@okaxis', amount: 1234.5 });
    expect(uri).toContain('am=1234.50');
    expect(uri).toContain('cu=INR');
  });

  it('falls back to a static QR when the amount is not payable', () => {
    for (const amount of [0, -5, null, undefined]) {
      expect(buildUpiUri({ vpa: 'shop@okaxis', amount })).not.toContain('am=');
    }
  });

  it('percent-encodes the merchant name so an & in it cannot corrupt the query', () => {
    const uri = buildUpiUri({ vpa: 'shop@okaxis', payeeName: 'Tea & Co=1' });
    expect(uri).toContain('pn=Tea%20%26%20Co%3D1');
    // One pa, one pn — the name did not smuggle in a third parameter.
    expect(uri.split('&')).toHaveLength(2);
  });

  it('carries the invoice reference into the payer bank statement', () => {
    const uri = buildUpiUri({ vpa: 'shop@okaxis', transactionRef: 'INV-1', transactionNote: 'Invoice INV-1' });
    expect(uri).toContain('tr=INV-1');
    expect(uri).toContain('tn=Invoice%20INV-1');
  });

  it('puts pa first, the order every UPI app documents', () => {
    expect(buildUpiUri({ vpa: 'shop@okaxis', payeeName: 'Shop', amount: 10 })).toMatch(/^upi:\/\/pay\?pa=/);
  });
});

describe('isUpiConfigured', () => {
  it('treats blank and whitespace-only as not configured', () => {
    expect(isUpiConfigured('shop@okaxis')).toBe(true);
    expect(isUpiConfigured('  ')).toBe(false);
    expect(isUpiConfigured(null)).toBe(false);
  });
});

describe('paymentQrEnabled', () => {
  it('keeps the QR on templates saved before PaymentQrConfig existed', () => {
    expect(paymentQrEnabled(true, false)).toBe(true);
    expect(paymentQrEnabled(false, true)).toBe(true);
    expect(paymentQrEnabled(false, false)).toBe(false);
  });
});

describe('shouldRenderPaymentQr', () => {
  const base = { enabled: true, visibility: 'always', amountDue: 100, vpa: 'shop@okaxis' };

  it('renders for an ordinary unpaid bill', () => {
    expect(shouldRenderPaymentQr(base)).toBe(true);
  });

  it('never renders without a VPA, since the QR could only be unpayable', () => {
    expect(shouldRenderPaymentQr({ ...base, vpa: null })).toBe(false);
  });

  it('honours never, and hides on a settled bill under unpaid_only', () => {
    expect(shouldRenderPaymentQr({ ...base, visibility: 'never' })).toBe(false);
    expect(shouldRenderPaymentQr({ ...base, visibility: 'unpaid_only', amountDue: 0 })).toBe(false);
    expect(shouldRenderPaymentQr({ ...base, visibility: 'unpaid_only', amountDue: 50 })).toBe(true);
  });

  it('renders on a settled bill when visibility is always — a tip or a top-up still needs it', () => {
    expect(shouldRenderPaymentQr({ ...base, amountDue: 0 })).toBe(true);
  });
});

describe('buildPaymentQrEntry', () => {
  const paymentQr = { enabled: true, label: 'Scan to Pay', show_amount: true, visibility: 'always' };

  it('builds a payable, labelled entry for the receipt', () => {
    const entry = buildPaymentQrEntry({
      qrBarcodePaymentQr: false,
      paymentQr,
      amountDue: 250,
      vpa: 'shop@okaxis',
      payeeName: 'Tea Shop',
      reference: 'INV-9',
    });
    expect(entry?.caption).toBe('Scan to Pay');
    expect(entry?.data).toContain('pa=shop%40okaxis');
    expect(entry?.data).toContain('am=250.00');
    expect(entry?.data).toContain('tr=INV-9');
  });

  it('omits the amount when the template wants a static counter QR', () => {
    const entry = buildPaymentQrEntry({
      qrBarcodePaymentQr: false,
      paymentQr: { ...paymentQr, show_amount: false },
      amountDue: 250,
      vpa: 'shop@okaxis',
      payeeName: 'Tea Shop',
    });
    expect(entry?.data).not.toContain('am=');
  });

  it('returns nothing rather than throwing when the business has no UPI ID set up', () => {
    expect(
      buildPaymentQrEntry({ qrBarcodePaymentQr: true, paymentQr, amountDue: 250, vpa: null, payeeName: 'Tea Shop' }),
    ).toBeNull();
  });
});
