import type { CartLine } from '@/features/pos/store/cartStore';

export function effectivePrice(line: CartLine): number {
  return line.overridePrice ?? line.product.selling_price;
}
