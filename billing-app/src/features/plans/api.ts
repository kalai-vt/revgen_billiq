import { request } from '@/lib/api-client';
import type { PlanId } from '@/features/auth/api';

interface UsageEntry {
  used: number;
  limit: number | null;
}

interface StorageUsageEntry {
  used: null;
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
