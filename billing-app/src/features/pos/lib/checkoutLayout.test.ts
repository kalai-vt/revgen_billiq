import { describe, expect, it } from 'vitest';
import {
  computeCheckoutGridColumns,
  getVisiblePaymentMethods,
  getVisiblePaymentTypes,
  isElementVisible,
} from '@/features/pos/lib/checkoutLayout';
import { DEFAULT_CHECKOUT_CONFIG, type CheckoutElementKey } from '@/features/pos/lib/checkoutElements';

function config(overrides: Partial<Record<CheckoutElementKey, boolean>> = {}) {
  return { ...DEFAULT_CHECKOUT_CONFIG, ...overrides };
}

describe('isElementVisible', () => {
  it('a plain element (no module dependency) follows the setting directly', () => {
    expect(isElementVisible('discount', config({ discount: true }), false)).toBe(true);
    expect(isElementVisible('discount', config({ discount: false }), false)).toBe(false);
  });

  it('partially_paid and credit require BOTH the Outstanding module AND the setting', () => {
    expect(isElementVisible('partially_paid', config({ partially_paid: true }), true)).toBe(true);
    expect(isElementVisible('partially_paid', config({ partially_paid: true }), false)).toBe(false);
    expect(isElementVisible('partially_paid', config({ partially_paid: false }), true)).toBe(false);
    expect(isElementVisible('credit', config({ credit: true }), true)).toBe(true);
    expect(isElementVisible('credit', config({ credit: true }), false)).toBe(false);
  });

  it('paid_in_full has no module dependency — Outstanding being off does not hide it', () => {
    expect(isElementVisible('paid_in_full', config({ paid_in_full: true }), false)).toBe(true);
  });
});

describe('getVisiblePaymentTypes / getVisiblePaymentMethods', () => {
  it('all three payment types show when everything is enabled and Outstanding is on', () => {
    expect(getVisiblePaymentTypes(config(), true)).toEqual(['paid', 'partial', 'credit']);
  });

  it('only Paid in Full shows when Outstanding is off, regardless of the other settings', () => {
    expect(getVisiblePaymentTypes(config(), false)).toEqual(['paid']);
  });

  it('a disabled payment type is excluded even with Outstanding on', () => {
    expect(getVisiblePaymentTypes(config({ credit: false }), true)).toEqual(['paid', 'partial']);
  });

  it('all payment methods show by default; disabling one removes only that one', () => {
    expect(getVisiblePaymentMethods(config())).toEqual(['cash', 'card', 'upi']);
    expect(getVisiblePaymentMethods(config({ card: false }))).toEqual(['cash', 'upi']);
  });
});

describe('computeCheckoutGridColumns', () => {
  it('reproduces exactly today\'s fixed layout when every element is enabled', () => {
    expect(computeCheckoutGridColumns(config(), true)).toBe('2.78fr 5.000fr 2.900fr');
  });

  it('narrows Checkout and widens Cart by the same amount as groups are disabled', () => {
    const allOff = config({
      customer: false,
      phone: false,
      discount: false,
      tax: false,
      paid_in_full: false,
      partially_paid: false,
      credit: false,
      cash: false,
      card: false,
      upi: false,
      amount_tendered: false,
      change_due: false,
      hold_bill: false,
    });
    const columns = computeCheckoutGridColumns(allOff, true);
    const [products, cart, checkout] = columns.split(' ').map((v) => parseFloat(v));
    expect(products).toBeCloseTo(2.78);
    expect(checkout).toBeCloseTo(1.8);
    // Cart must gain back exactly what Checkout gave up relative to the full-config baseline.
    expect(cart).toBeCloseTo(5 + (2.9 - 1.8));
  });

  it('Products column width never changes — only Cart/Checkout trade space', () => {
    const full = computeCheckoutGridColumns(config(), true).split(' ')[0];
    const minimal = computeCheckoutGridColumns(config({ discount: false, tax: false }), true).split(' ')[0];
    expect(full).toBe(minimal);
  });

  it('losing partial/credit alone does not narrow checkout — paid_in_full keeps the payment_type group active', () => {
    const withOutstanding = computeCheckoutGridColumns(config(), true);
    const withoutOutstandingModule = computeCheckoutGridColumns(config(), false);
    const withoutOutstandingSetting = computeCheckoutGridColumns(config({ partially_paid: false, credit: false }), true);
    // All three land on the same columns: whether Outstanding is off via the module flag, off via
    // the settings, or fully on, paid_in_full alone still keeps the payment_type group "active",
    // and group *presence* (not element count within it) is what the layout reacts to.
    expect(withoutOutstandingModule).toBe(withoutOutstandingSetting);
    expect(withoutOutstandingModule).toBe(withOutstanding);
  });

  it('narrows checkout only once an entire group has nothing left visible', () => {
    const baseline = computeCheckoutGridColumns(config(), true);
    const paymentTypeGroupEmpty = computeCheckoutGridColumns(
      config({ paid_in_full: false, partially_paid: false, credit: false }),
      true,
    );
    expect(paymentTypeGroupEmpty).not.toBe(baseline);
  });
});
