import { request } from '@/lib/api-client';
import type { PlanId } from '@/lib/plans';

export type SubscriptionStatus = 'trialing' | 'active' | 'suspended' | 'expired' | 'cancelled';

// Matches the `status_filter` query param accepted by GET /api/admin/subscriptions.
export type SubscriptionStatusFilter = 'all' | 'trial' | 'expiring_soon' | 'expired' | 'suspended' | 'active';

export interface SubscriptionListItem {
  tenant_id: string;
  company_name: string;
  owner_email: string;
  plan: string;
  price_inr: number;
  subscription_status: SubscriptionStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  days_remaining: number | null;
  suspension_reason: string | null;
  last_reminder_sent_at: string | null;
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

export interface SubscriptionPayment {
  id: string;
  plan: string;
  amount_inr: number;
  status: 'created' | 'paid' | 'failed';
  created_at: string;
  paid_at: string | null;
}

export interface SubscriptionDetail {
  tenant_id: string;
  company_name: string;
  plan: string;
  price_inr: number;
  subscription_status: SubscriptionStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  days_remaining: number | null;
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  reactivated_at: string | null;
  reactivated_by: string | null;
  payments: SubscriptionPayment[];
  history: SubscriptionEvent[];
}

export type ReminderChannel = 'sms' | 'whatsapp' | 'email';
export type ReminderStatus = 'sent' | 'failed';

export interface TrialReminder {
  id: string;
  tenant_id: string;
  company_name: string;
  channel: ReminderChannel;
  template: string;
  sent_by_admin_name: string;
  status: ReminderStatus;
  provider_message_id: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface TrialReminderResult {
  channel: ReminderChannel;
  status: ReminderStatus;
  provider_message_id: string | null;
  failure_reason: string | null;
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

export function listSubscriptions(statusFilter: SubscriptionStatusFilter = 'all'): Promise<SubscriptionListItem[]> {
  const suffix = statusFilter && statusFilter !== 'all' ? `?status_filter=${statusFilter}` : '';
  return request(`/api/admin/subscriptions${suffix}`);
}

export function getSubscription(tenantId: string): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription`);
}

export function updateSubscription(
  tenantId: string,
  payload: {
    plan?: PlanId;
    subscription_status?: SubscriptionStatus;
    trial_ends_at?: string;
    clear_trial?: boolean;
    subscription_ends_at?: string;
    note?: string;
  },
): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function suspendSubscription(tenantId: string, note?: string): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription/suspend`, { method: 'POST', body: JSON.stringify({ note }) });
}

export function resumeSubscription(tenantId: string, note?: string): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription/resume`, { method: 'POST', body: JSON.stringify({ note }) });
}

export function activateSubscription(
  tenantId: string,
  payload: { plan: PlanId; subscription_ends_at?: string; note?: string },
): Promise<SubscriptionDetail> {
  return request(`/api/admin/customers/${tenantId}/subscription/activate`, { method: 'POST', body: JSON.stringify(payload) });
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

export function listTrialReminders(tenantId: string): Promise<TrialReminder[]> {
  return request(`/api/admin/customers/${tenantId}/trial-reminders`);
}

export function sendTrialReminder(tenantId: string, channels: ReminderChannel[]): Promise<TrialReminderResult[]> {
  return request(`/api/admin/customers/${tenantId}/trial-reminders`, { method: 'POST', body: JSON.stringify({ channels }) });
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
