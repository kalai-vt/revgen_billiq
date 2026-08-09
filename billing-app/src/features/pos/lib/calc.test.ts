import { describe, expect, it } from 'vitest';
import { computeTotals } from '@/features/pos/lib/calc';
import type { CartLine } from '@/features/pos/store/cartStore';
import type { Product } from '@/features/products/api';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
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
    ...overrides,
  };
}

function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  return { product: makeProduct(), quantity: 1, overridePrice: null, ...overrides };
}

describe('computeTotals — tax', () => {
  it('defaults every line to its own product tax_rate_percent when no override is given', () => {
    const lines = [makeLine({ product: makeProduct({ tax_rate_percent: 2.5, selling_price: 100 }) })];
    const totals = computeTotals(lines, null, 0, null);
    expect(totals.taxAmount).toBe(2.5);
    expect(totals.effectiveTaxPercentage).toBe(2.5);
    expect(totals.total).toBe(102.5);
  });

  it('taxes a mixed-rate cart correctly per line, with an exact blended effective rate', () => {
    const lines = [
      makeLine({ product: makeProduct({ id: 'a', tax_rate_percent: 5, selling_price: 100 }) }),
      makeLine({ product: makeProduct({ id: 'b', tax_rate_percent: 12, selling_price: 100 }) }),
    ];
    const totals = computeTotals(lines, null, 0, null);
    // 5 (5% of 100) + 12 (12% of 100) = 17
    expect(totals.taxAmount).toBe(17);
    expect(totals.effectiveTaxPercentage).toBe(8.5);
    expect(totals.total).toBe(217);
  });

  it('a manual override applies that single rate to every line, ignoring product tax rates', () => {
    const lines = [
      makeLine({ product: makeProduct({ id: 'a', tax_rate_percent: 5, selling_price: 100 }) }),
      makeLine({ product: makeProduct({ id: 'b', tax_rate_percent: 12, selling_price: 100 }) }),
    ];
    const totals = computeTotals(lines, null, 0, 18);
    expect(totals.taxAmount).toBe(36);
    expect(totals.effectiveTaxPercentage).toBe(18);
  });

  it('proportionally distributes a flat discount across lines before taxing each at its own rate', () => {
    const lines = [
      makeLine({ product: makeProduct({ id: 'a', tax_rate_percent: 10, selling_price: 100 }) }),
      makeLine({ product: makeProduct({ id: 'b', tax_rate_percent: 0, selling_price: 100 }) }),
    ];
    // 50 flat discount, split 25/25 across the two equal-priced lines.
    const totals = computeTotals(lines, 'flat', 50, null);
    expect(totals.discountAmount).toBe(50);
    // line a: (100-25) taxable * 10% = 7.5; line b: (100-25) * 0% = 0
    expect(totals.taxAmount).toBe(7.5);
  });

  it('a product with zero tax contributes nothing even when other lines are taxed', () => {
    const lines = [
      makeLine({ product: makeProduct({ id: 'a', tax_rate_percent: 0, selling_price: 50 }) }),
      makeLine({ product: makeProduct({ id: 'b', tax_rate_percent: 2.5, selling_price: 50 }) }),
    ];
    const totals = computeTotals(lines, null, 0, null);
    expect(totals.taxAmount).toBe(1.25);
  });

  it('an empty cart has zero tax and a zero effective rate, not NaN', () => {
    const totals = computeTotals([], null, 0, null);
    expect(totals.taxAmount).toBe(0);
    expect(totals.effectiveTaxPercentage).toBe(0);
  });
});
