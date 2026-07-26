import { request } from '@/lib/api-client';

export interface ResourceUsage {
  used: number;
  limit: number | null;
  pct_used: number | null;
}

export interface UsageAnalyticsItem {
  tenant_id: string;
  company_name: string;
  plan: string;
  users: ResourceUsage;
  products: ResourceUsage;
  customers: ResourceUsage;
  monthly_invoices: ResourceUsage;
  max_pct_used: number | null;
  at_risk: boolean;
}

export function listUsageAnalytics(onlyAtRisk = false): Promise<UsageAnalyticsItem[]> {
  return request(`/api/admin/usage-analytics?only_at_risk=${onlyAtRisk}`);
}
