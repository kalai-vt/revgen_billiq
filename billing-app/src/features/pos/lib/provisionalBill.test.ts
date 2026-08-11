import { afterEach, describe, expect, it } from 'vitest';
import type { CartLine } from '@/features/pos/hooks/useCart';
import type { CartTotals } from '@/features/pos/lib/calc';
import type { Product } from '@/features/products/api';
import {
  buildProvisionalBillSnapshot,
  consumeProvisionalBillSnapshot,
  generateOrderReference,
  provisionalBillToPreviewData,
  storeProvisionalBillSnapshot,
  type ProvisionalBillSnapshot,
} from '@/features/pos/lib/provisionalBill';

const product: Product = {
  id: 'prod-1',
  tenant_id: 'tenant-1',
  name: 'Widget',
  identifier_type: 'pid',
  identifier_label: null,
  identifier_value: 'WID-1',
  barcode: null,
  category_id: null,
  category_name: null,
  description: null,
  cost_price: 10,
  selling_price: 100,
  tax_rate_percent: 2.5,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  additional_identifiers: [],
};

const lines: CartLine[] = [
  { product, quantity: 2, overridePrice: null },
  { product: { ...product, id: 'prod-2', name: 'Gadget', identifier_value: 'GAD-1', selling_price: 400 }, quantity: 1, overridePrice: 350 },
];

const totals: CartTotals = {
  subtotal: 1000,
  discountAmount: 100,
  taxableAmount: 900,
  taxAmount: 45,
  total: 945,
  effectiveTaxPercentage: 5,
};

describe('generateOrderReference', () => {
  it('is ORD-prefixed and never collides with the INV- invoice number format', () => {
    const ref = generateOrderReference();
    expect(ref).toMatch(/^ORD-[0-9A-Z]+$/);
    expect(ref).not.toMatch(/^INV-/);
  });
});

describe('buildProvisionalBillSnapshot', () => {
  it('maps cart lines using effective (override-aware) price and the supplied totals verbatim', () => {
    const snapshot = buildProvisionalBillSnapshot({
      lines,
      totals,
      customerName: 'Jane Doe',
      customerPhone: '9999999999',
      discountType: 'flat',
      discountValue: 100,
      taxPercentage: 5,
      paymentType: 'paid',
      paymentMethod: 'cash',
    });

    expect(snapshot.lines).toEqual([
      { productName: 'Widget', identifierValue: 'WID-1', quantity: 2, unitPrice: 100, lineTotal: 200 },
      { productName: 'Gadget', identifierValue: 'GAD-1', quantity: 1, unitPrice: 350, lineTotal: 350 },
    ]);
    expect(snapshot.subtotal).toBe(totals.subtotal);
    expect(snapshot.discountAmount).toBe(totals.discountAmount);
    expect(snapshot.taxAmount).toBe(totals.taxAmount);
    expect(snapshot.total).toBe(totals.total);
    expect(snapshot.customerName).toBe('Jane Doe');
    expect(snapshot.customerPhone).toBe('9999999999');
  });

  it('normalizes blank customer name/phone to null rather than empty strings', () => {
    const snapshot = buildProvisionalBillSnapshot({
      lines,
      totals,
      customerName: '',
      customerPhone: '',
      discountType: null,
      discountValue: 0,
      taxPercentage: 5,
      paymentType: 'paid',
      paymentMethod: 'cash',
    });
    expect(snapshot.customerName).toBeNull();
    expect(snapshot.customerPhone).toBeNull();
  });
});

describe('storeProvisionalBillSnapshot / consumeProvisionalBillSnapshot', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('round-trips a snapshot through localStorage', () => {
    const snapshot = buildProvisionalBillSnapshot({
      lines,
      totals,
      customerName: 'Jane Doe',
      customerPhone: '',
      discountType: 'flat',
      discountValue: 100,
      taxPercentage: 5,
      paymentType: 'paid',
      paymentMethod: 'cash',
    });
    storeProvisionalBillSnapshot(snapshot);
    expect(consumeProvisionalBillSnapshot()).toEqual(snapshot);
  });

  it('clears the draft on read, so a stale snapshot never resurfaces for a later print', () => {
    const snapshot = buildProvisionalBillSnapshot({
      lines,
      totals,
      customerName: '',
      customerPhone: '',
      discountType: null,
      discountValue: 0,
      taxPercentage: 5,
      paymentType: 'paid',
      paymentMethod: 'cash',
    });
    storeProvisionalBillSnapshot(snapshot);
    consumeProvisionalBillSnapshot();
    expect(consumeProvisionalBillSnapshot()).toBeNull();
  });

  it('returns null when nothing has been stored', () => {
    expect(consumeProvisionalBillSnapshot()).toBeNull();
  });
});

describe('provisionalBillToPreviewData', () => {
  const snapshot: ProvisionalBillSnapshot = {
    reference: 'ORD-ABC123',
    createdAtIso: '2026-08-08T10:30:00.000Z',
    lines: [{ productName: 'Widget', identifierValue: 'WID-1', quantity: 2, unitPrice: 100, lineTotal: 200 }],
    customerName: 'Jane Doe',
    customerPhone: '9999999999',
    discountType: 'flat',
    discountValue: 100,
    taxPercentage: 5,
    subtotal: 1000,
    discountAmount: 100,
    taxAmount: 45,
    total: 945,
    paymentType: 'partial',
    paymentMethod: 'cash',
  };

  it('clearly marks the document as a non-final provisional bill', () => {
    const data = provisionalBillToPreviewData(snapshot, 'DD/MM/YYYY', 2);
    expect(data.documentLabel).toMatch(/PROVISIONAL BILL/);
    expect(data.documentLabel).toMatch(/NOT A FINAL INVOICE/);
    expect(data.number).toBe('ORD-ABC123');
  });

  it('carries Sale Amount / Discount / Tax / Total through to totals unchanged, satisfying Total = Sale Amount - Discount + Tax', () => {
    const data = provisionalBillToPreviewData(snapshot, 'DD/MM/YYYY', 2);
    expect(data.totals.subtotal).toBe(1000);
    expect(data.totals.discount).toBe(100);
    expect(data.totals.igst).toBe(45);
    expect(data.totals.grand_total).toBe(945);
    expect((data.totals.subtotal ?? 0) - (data.totals.discount ?? 0) + (data.totals.igst ?? 0)).toBe(data.totals.grand_total);
  });

  it('marks payment as pending — nothing has actually been collected at print time', () => {
    const data = provisionalBillToPreviewData(snapshot, 'DD/MM/YYYY', 2);
    expect(data.paymentStatus).toMatch(/Pending/);
    expect(data.paymentStatus).toMatch(/Partially Paid/);
  });

  it('formats the date according to the tenant date_format setting', () => {
    expect(provisionalBillToPreviewData(snapshot, 'DD/MM/YYYY', 2).date).toBe('08/08/2026');
    expect(provisionalBillToPreviewData(snapshot, 'MM/DD/YYYY', 2).date).toBe('08/08/2026');
    expect(provisionalBillToPreviewData(snapshot, 'YYYY-MM-DD', 2).date).toBe('2026-08-08');
  });
});
