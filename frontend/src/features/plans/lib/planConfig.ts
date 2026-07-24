import type { PlanId } from '@/features/auth/api';

export interface PlanFeatures {
  whatsapp_invoice: boolean;
  advanced_analytics: boolean;
  user_management: boolean;
  barcode_support: boolean;
}

export interface PlanConfig {
  label: string;
  priceInr: number;
  maxUsers: number | null;
  maxProducts: number | null;
  maxCustomers: number | null;
  maxMonthlyInvoices: number | null;
  maxBranches: number | null;
  features: PlanFeatures;
}

// Client-side mirror of backend/app/core/plans.py — UI hints only.
// The backend re-validates every mutating request independently; this never
// grants access on its own, it only decides what to show/hide/disable.
export const PLANS: Record<PlanId, PlanConfig> = {
  basic: {
    label: 'Basic',
    priceInr: 999,
    maxUsers: 1,
    maxProducts: 500,
    maxCustomers: 500,
    maxMonthlyInvoices: 1000,
    maxBranches: 1,
    features: { whatsapp_invoice: false, advanced_analytics: false, user_management: false, barcode_support: false },
  },
  explore: {
    label: 'Explore',
    priceInr: 1999,
    maxUsers: 10,
    maxProducts: 10000,
    maxCustomers: null,
    maxMonthlyInvoices: null,
    maxBranches: 3,
    features: { whatsapp_invoice: true, advanced_analytics: true, user_management: true, barcode_support: true },
  },
  advance: {
    label: 'Advance',
    priceInr: 2999,
    maxUsers: null,
    maxProducts: null,
    maxCustomers: null,
    maxMonthlyInvoices: null,
    maxBranches: null,
    features: { whatsapp_invoice: true, advanced_analytics: true, user_management: true, barcode_support: true },
  },
};

export const PLAN_ORDER: PlanId[] = ['basic', 'explore', 'advance'];

export function getPlanConfig(plan: PlanId | null | undefined): PlanConfig {
  return PLANS[plan ?? 'basic'];
}

export function hasFeature(plan: PlanId | null | undefined, feature: keyof PlanFeatures): boolean {
  return getPlanConfig(plan).features[feature];
}
