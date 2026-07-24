import type { CartLine } from '@/features/pos/hooks/useCart';
import type { DiscountType } from '@/features/pos/api';
import { effectivePrice } from '@/features/pos/lib/pricing';

export interface CartTotals {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  total: number;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Mirrors the backend pricing engine in app/modules/sales/service.py for live preview. */
export function computeTotals(
  lines: CartLine[],
  discountType: DiscountType,
  discountValue: number,
  taxPercentage: number,
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
  const taxAmount = round2(taxableAmount * (taxPercentage / 100));
  const total = round2(taxableAmount + taxAmount);

  return { subtotal, discountAmount, taxableAmount, taxAmount, total };
}
