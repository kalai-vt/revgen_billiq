import { request } from '@/lib/api-client';

export interface SubscriptionListItem {
  tenant_id: string;
  company_name: string;
  plan: string;
  price_inr: number;
  subscription_status: string;
  trial_ends_at: string | null;
  created_at: string;
}

export interface SubscriptionEvent {
  id: string;
  event_type: string;
  from_plan: string | null;
  to_plan: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  changed_by: string;
  created_at: string;
}

export interface SubscriptionDetail {
  tenant_id: string;
  company_name: string;
  plan: string;
  price_inr: number;
  subscription_status: string;
  trial_ends_at: string | null;
  history: SubscriptionEvent[];
}

export function listSubscriptions(): Promise<SubscriptionListItem[]> {
  return request('/api/admin/subscriptions');
}

export function getSubscription(tenantId: string): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription`);
}

export function updateSubscription(
  tenantId: string,
  payload: { plan?: string; subscription_status?: string; clear_trial?: boolean; note?: string },
): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription`, { method: 'PUT', body: JSON.stringify(payload) });
}
