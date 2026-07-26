import { request } from '@/lib/api-client';

export interface RevenueTrendPoint {
  month: string;
  revenue: number;
}

export interface DashboardSummary {
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  today_signups: number;
  total_users: number;
  total_invoices: number;
  total_transactions: number;
  monthly_revenue: number;
  annual_revenue: number;
  outstanding_payments: number;
  revenue_trend: RevenueTrendPoint[];
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return request('/api/admin/dashboard/summary');
}
