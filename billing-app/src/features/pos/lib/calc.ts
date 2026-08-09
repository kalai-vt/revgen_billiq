import type { CartLine } from '@/features/pos/hooks/useCart';
import type { DiscountType } from '@/features/pos/api';
import { effectivePrice } from '@/features/pos/lib/pricing';

export interface CartTotals {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  total: number;
  /** Blended tax rate implied by taxAmount/taxableAmount — always a concrete display number,
   * whether taxPercentageOverride was null (derived from each line's own product tax rate) or
   * set (every line taxed at that single rate). Mathematically exact even for a cart mixing
   * products with different tax rates: taxAmount is summed per line first, this is derived from
   * that sum, not the other way around. */
  effectiveTaxPercentage: number;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Mirrors the backend pricing engine in app/modules/sales/service.py for live preview.
 *
 * Tax is computed per line, defaulting to each product's own `tax_rate_percent` — not a single
 * cart-wide rate — so a product's catalog tax rate is what actually reaches the bill. Passing
 * `taxPercentageOverride` (non-null, e.g. the cashier typed into the Tax % field at checkout)
 * applies that single rate to every line instead, overriding all of their individual rates. */
export function computeTotals(
  lines: CartLine[],
  discountType: DiscountType,
  discountValue: number,
  taxPercentageOverride: number | null,
): CartTotals {
  const subtotal = round2(lines.reduce((sum, line) => sum + effectivePrice(line) * line.quantity, 0));

  let discountAmount = 0;
  if (discountType === 'flat') {
    discountAmount = Math.min(discountValue, subtotal);
  } else if (discountType === 'percent') {
    discountAmount = subtotal * (Math.min(discountValue, 100) / 100);
  }
  discountAmount = round2(discountAmount);

  const taxableAmount = round2(subtotal - discountAmount);

  let taxAmount = 0;
  for (const line of lines) {
    const lineSubtotal = effectivePrice(line) * line.quantity;
    const proportionalDiscount = subtotal > 0 ? (lineSubtotal / subtotal) * discountAmount : 0;
    const lineTaxable = lineSubtotal - proportionalDiscount;
    const rate = taxPercentageOverride ?? line.product.tax_rate_percent;
    taxAmount += lineTaxable * (rate / 100);
  }
  taxAmount = round2(taxAmount);

  const total = round2(taxableAmount + taxAmount);
  const effectiveTaxPercentage =
    taxableAmount > 0 ? round2((taxAmount / taxableAmount) * 100) : (taxPercentageOverride ?? 0);

  return { subtotal, discountAmount, taxableAmount, taxAmount, total, effectiveTaxPercentage };
}
