import { request } from '@/lib/api-client';

export interface PaymentListItem {
  id: string;
  tenant_id: string;
  company_name: string;
  customer_name: string | null;
  payment_number: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  created_at: string;
}

export interface PaymentsSummary {
  collected_this_month: number;
  collected_all_time: number;
  by_method: Record<string, number>;
  outstanding_total: number;
  tenants_with_outstanding: number;
}

export function listPayments(
  params: { tenant_id?: string; payment_method?: string; limit?: number; offset?: number } = {},
): Promise<{ items: PaymentListItem[]; total: number }> {
  const query = new URLSearchParams();
  if (params.tenant_id) query.set('tenant_id', params.tenant_id);
  if (params.payment_method) query.set('payment_method', params.payment_method);
  query.set('limit', String(params.limit ?? 50));
  query.set('offset', String(params.offset ?? 0));
  return request(`/api/admin/payments?${query.toString()}`);
}

export function getPaymentsSummary(): Promise<PaymentsSummary> {
  return request('/api/admin/payments/summary');
}
