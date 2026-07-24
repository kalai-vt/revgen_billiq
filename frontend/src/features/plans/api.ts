import { request } from '@/lib/api-client';
import type { PlanId } from '@/features/auth/api';

interface UsageEntry {
  used: number;
  limit: number | null;
}

export interface BillingUsage {
  plan: PlanId;
  label: string;
  price_inr: number;
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
  };
}

export function getUsage(): Promise<BillingUsage> {
  return request('/api/billing/usage');
}
