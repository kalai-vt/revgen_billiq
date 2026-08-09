import { ELEMENT_GROUPS, type CheckoutElementKey } from '@/features/pos/lib/checkoutElements';
import type { PaymentMethod, PaymentType } from '@/features/pos/api';

const ALL_GROUPS = ['customer_info', 'pricing', 'payment_type', 'payment_method', 'cashier_tools'];

const ALL_PAYMENT_TYPES: PaymentType[] = ['paid', 'partial', 'credit'];
const PAYMENT_TYPE_TO_ELEMENT: Record<PaymentType, CheckoutElementKey> = {
  paid: 'paid_in_full',
  partial: 'partially_paid',
  credit: 'credit',
};
const ALL_PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'upi'];
const PAYMENT_METHOD_TO_ELEMENT: Record<PaymentMethod, CheckoutElementKey> = {
  cash: 'cash',
  card: 'card',
  upi: 'upi',
};

export function getVisiblePaymentTypes(
  config: Record<CheckoutElementKey, boolean>,
  outstandingEnabled: boolean,
): PaymentType[] {
  return ALL_PAYMENT_TYPES.filter((type) => isElementVisible(PAYMENT_TYPE_TO_ELEMENT[type], config, outstandingEnabled));
}

export function getVisiblePaymentMethods(config: Record<CheckoutElementKey, boolean>): PaymentMethod[] {
  return ALL_PAYMENT_METHODS.filter((method) => config[PAYMENT_METHOD_TO_ELEMENT[method]]);
}

/** Effective visibility per element — folds in the Outstanding-module dependency so callers never
 * have to remember to AND it in separately (requirement: partial/credit only ever show when BOTH
 * the Outstanding module and the corresponding checkout setting are on). */
export function isElementVisible(
  key: CheckoutElementKey,
  config: Record<CheckoutElementKey, boolean>,
  outstandingEnabled: boolean,
): boolean {
  if ((key === 'partially_paid' || key === 'credit') && !outstandingEnabled) return false;
  return config[key];
}

/** Dynamic grid-template-columns for the Products | Cart | Checkout layout. Checkout's share
 * shrinks with how many element groups it's actually showing, and Cart absorbs exactly what
 * Checkout gives up — Products stays fixed. Calibrated so "everything enabled" reproduces
 * today's fixed 2.78fr/5fr/2.9fr split exactly (zero layout change for a tenant who never opens
 * this settings page), and progressively narrows Checkout / widens Cart as elements are disabled,
 * down to a floor that still fits the mandatory Total tile and Checkout button. */
export function computeCheckoutGridColumns(
  config: Record<CheckoutElementKey, boolean>,
  outstandingEnabled: boolean,
): string {
  const visibleKeys = (Object.keys(config) as CheckoutElementKey[]).filter((key) =>
    isElementVisible(key, config, outstandingEnabled),
  );
  const activeGroups = new Set(visibleKeys.map((key) => ELEMENT_GROUPS[key]));
  const ratio = activeGroups.size / ALL_GROUPS.length;
  const checkoutFr = 1.8 + ratio * 1.1;
  const cartFr = 5 + (2.9 - checkoutFr);
  return `2.78fr ${cartFr.toFixed(3)}fr ${checkoutFr.toFixed(3)}fr`;
}
