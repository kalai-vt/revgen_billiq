import { request } from '@/lib/api-client';

export type SubscriptionStatus = 'trialing' | 'active' | 'suspended' | 'expired' | 'cancelled';

export interface SubscriptionListItem {
  tenant_id: string;
  company_name: string;
  plan: string;
  price_inr: number;
  subscription_status: SubscriptionStatus;
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
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  history: SubscriptionEvent[];
}

export interface TenantLimitItem {
  limit_key: string;
  effective_value: number | null;
  plan_default: number | null;
  is_overridden: boolean;
}

export interface TenantLimits {
  tenant_id: string;
  plan: string;
  limits: TenantLimitItem[];
}

export function listSubscriptions(): Promise<SubscriptionListItem[]> {
  return request('/api/admin/subscriptions');
}

export function getSubscription(tenantId: string): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription`);
}

export function updateSubscription(
  tenantId: string,
  payload: { plan?: string; subscription_status?: SubscriptionStatus; trial_ends_at?: string; clear_trial?: boolean; note?: string },
): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function suspendSubscription(tenantId: string, note?: string): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription/suspend`, { method: 'POST', body: JSON.stringify({ note }) });
}

export function resumeSubscription(tenantId: string, note?: string): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription/resume`, { method: 'POST', body: JSON.stringify({ note }) });
}

export function expireSubscription(tenantId: string, note?: string): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription/expire`, { method: 'POST', body: JSON.stringify({ note }) });
}

export function extendTrial(
  tenantId: string,
  payload: { days?: number; trial_ends_at?: string; note?: string },
): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription/extend-trial`, { method: 'POST', body: JSON.stringify(payload) });
}

export function getTenantLimits(tenantId: string): Promise<TenantLimits> {
  return request(`/api/admin/customers/${tenantId}/limits`);
}

export function updateTenantLimits(
  tenantId: string,
  overrides: { limit_key: string; limit_value?: number | null; reset?: boolean }[],
): Promise<TenantLimits> {
  return request(`/api/admin/customers/${tenantId}/limits`, { method: 'PUT', body: JSON.stringify({ overrides }) });
}
