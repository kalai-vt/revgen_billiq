import { request } from '@/lib/api-client';
import type { PlanId } from '@/features/auth/api';

interface UsageEntry {
  used: number;
  limit: number | null;
}

interface StorageUsageEntry {
  /** Megabytes used across avatars + tenant logo — the only uploads this app has today. */
  used: number;
  limit: number | null;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'suspended' | 'expired' | 'cancelled';

export interface BillingUsage {
  plan: PlanId;
  label: string;
  price_inr: number;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  billing_cycle: { start: string; end: string };
  features: {
    whatsapp_invoice: boolean;
    advanced_analytics: boolean;
    user_management: boolean;
    barcode_support: boolean;
  };
  usage: {
    users: UsageEntry;
    products: UsageEntry;
    customers: UsageEntry;
    monthly_invoices: UsageEntry;
    branches: UsageEntry;
    warehouses: UsageEntry;
    storage: StorageUsageEntry;
  };
}

export function getUsage(): Promise<BillingUsage> {
  return request('/api/billing/usage');
}

export interface CheckoutOrder {
  order_id: string;
  amount_inr: number;
  currency: string;
  razorpay_key_id: string;
  plan: string;
  plan_label: string;
}

export interface VerifyPaymentPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface SubscriptionPayment {
  id: string;
  plan: string;
  amount_inr: number;
  status: 'created' | 'paid' | 'failed';
  created_at: string;
  paid_at: string | null;
}

export function createCheckoutOrder(): Promise<CheckoutOrder> {
  return request('/api/billing/checkout', { method: 'POST' });
}

export function verifyPayment(payload: VerifyPaymentPayload): Promise<{ status: string }> {
  return request('/api/billing/verify', { method: 'POST', body: JSON.stringify(payload) });
}

export function listPayments(): Promise<SubscriptionPayment[]> {
  return request('/api/billing/payments');
}
