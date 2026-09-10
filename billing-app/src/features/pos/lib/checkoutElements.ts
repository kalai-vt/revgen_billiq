import { useQuery } from '@tanstack/react-query';
import * as settingsApi from '@/features/settings/api';

/** The checkout elements POSPage/CheckoutPanel have bespoke rendering for today. Mirrors (but
 * does not replace) the backend registry in app/core/checkout_elements.py — that catalog is the
 * source of truth for defaults/labels/dependencies and drives the Settings toggle list generically;
 * this union just gives the checkout page's specific per-element conditionals compile-time safety.
 * Total and Checkout are deliberately absent — mandatory, never configurable. */
export type CheckoutElementKey =
  | 'customer'
  | 'phone'
  | 'discount'
  | 'tax'
  | 'paid_in_full'
  | 'partially_paid'
  | 'credit'
  | 'cash'
  | 'card'
  | 'upi'
  | 'payment_reference'
  | 'amount_tendered'
  | 'change_due'
  | 'hold_bill'
  | 'table'
  | 'print_order_bill'
  | 'print_kot';

/** Same safe-default philosophy as the backend (app/core/checkout_elements.py
 * DEFAULT_CHECKOUT_CONFIG) and useFeatureFlag: absent/still-loading reads as enabled, so a tenant
 * who's never configured this — or a slow network on first paint — sees today's full checkout,
 * never one that's silently missing pieces. */
export const DEFAULT_CHECKOUT_CONFIG: Record<CheckoutElementKey, boolean> = {
  customer: true,
  phone: true,
  discount: true,
  tax: true,
  paid_in_full: true,
  partially_paid: true,
  credit: true,
  cash: true,
  card: true,
  upi: true,
  payment_reference: true,
  amount_tendered: true,
  change_due: true,
  hold_bill: true,
  table: true,
  print_order_bill: true,
  print_kot: true,
};

/** Mirrors app/core/checkout_elements.py's group assignment — used to compute the layout reflow
 * (see checkoutLayout.ts), not for rendering per-element UI (that's bespoke per element already). */
export const ELEMENT_GROUPS: Record<CheckoutElementKey, string> = {
  customer: 'customer_info',
  phone: 'customer_info',
  discount: 'pricing',
  tax: 'pricing',
  paid_in_full: 'payment_type',
  partially_paid: 'payment_type',
  credit: 'payment_type',
  cash: 'payment_method',
  card: 'payment_method',
  upi: 'payment_method',
  payment_reference: 'payment_method',
  amount_tendered: 'cashier_tools',
  change_due: 'cashier_tools',
  hold_bill: 'cashier_tools',
  table: 'cashier_tools',
  print_order_bill: 'cashier_tools',
  print_kot: 'cashier_tools',
};

export function useCheckoutConfigQuery() {
  return useQuery({
    queryKey: ['checkout-config'],
    queryFn: settingsApi.getCheckoutConfig,
    staleTime: 60_000,
  });
}

/** Resolved per-element visibility for the current tenant — absent keys (not yet fetched, or a
 * newly added element an older cached response predates) fall back to enabled. */
export function useCheckoutConfig(): Record<CheckoutElementKey, boolean> {
  const { data } = useCheckoutConfigQuery();
  const config = data?.config;
  const result = { ...DEFAULT_CHECKOUT_CONFIG };
  if (config) {
    for (const key of Object.keys(result) as CheckoutElementKey[]) {
      if (config[key] !== undefined) result[key] = config[key];
    }
  }
  return result;
}
