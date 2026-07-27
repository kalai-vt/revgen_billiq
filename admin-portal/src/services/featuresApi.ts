import { request } from '@/lib/api-client';

export type FlagStatus = 'enabled' | 'disabled' | 'suspended';
export type AccessLevel = 'full_access' | 'read_only';
export type FeatureCategory = 'core' | 'business' | 'ai' | 'premium';

export interface ConfigFieldSchema {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'text';
  default: unknown;
}

export interface TenantFeatureItem {
  module_key: string;
  label: string;
  description: string;
  category: FeatureCategory;
  is_implemented: boolean;
  always_on: boolean;
  requires: string[];
  min_version: string;
  version_gated: boolean;
  config_schema: ConfigFieldSchema[];
  status: FlagStatus;
  hidden_from_nav: boolean;
  access_level: AccessLevel;
  config: Record<string, unknown> | null;
  is_custom: boolean;
  updated_at: string | null;
  updated_by_admin_name: string | null;
  reason: string | null;
}

export interface FeatureUpdatePayload {
  status?: FlagStatus;
  hidden_from_nav?: boolean;
  access_level?: AccessLevel;
  config?: Record<string, unknown>;
  reason?: string;
  force?: boolean;
}

export interface FeatureImpact {
  module_key: string;
  target_status: FlagStatus;
  affected_dependents: string[];
  data_impact: string;
  blocked: boolean;
  block_reason: string | null;
  requires_confirmation: boolean;
}

export interface BulkUpdateResult {
  updated: string[];
  skipped: { tenant_id: string; error: string }[];
}

export interface FeatureTemplateModule {
  module_key: string;
  status: FlagStatus;
  config: Record<string, unknown> | null;
}

export interface FeatureTemplateItem {
  id: string;
  name: string;
  description: string | null;
  modules: FeatureTemplateModule[];
  is_system: boolean;
  created_by_admin_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureHistoryItem {
  id: string;
  tenant_id: string;
  module_key: string;
  action: string;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  changed_by_admin_name: string;
  reason: string | null;
  created_at: string;
}

export interface FeatureScheduleItem {
  id: string;
  tenant_id: string;
  module_key: string;
  action: string;
  scheduled_for: string;
  status: string;
  created_by_admin_name: string;
  created_at: string;
  applied_at: string | null;
}

export interface FeatureSummary {
  total_customers: number;
  active_customers: number;
  customers_with_custom_features: number;
  default_configuration_customers: number;
  modules_enabled_today: number;
  modules_disabled_today: number;
}

export interface CustomerFeaturePanelItem {
  tenant_id: string;
  company_name: string;
  industry: string | null;
  plan: string;
  status: string;
  subscription_status: string;
  is_trial: boolean;
  country: string;
  app_version: string;
  modules_enabled_count: number;
  has_custom_features: boolean;
  last_login: string | null;
  created_at: string;
  trial_ends_at: string | null;
}

export interface FeatureAnalytics {
  most_enabled: { module_key: string; label: string; count: number; percentage: number }[];
  least_enabled: { module_key: string; label: string; count: number; percentage: number }[];
  adoption_rate: { category: string; label: string; percentage: number }[];
  premium_usage: { module_key: string; label: string; count: number; percentage: number }[];
  ai_usage: { module_key: string; label: string; count: number; percentage: number }[];
  customers_by_plan: { plan: string; count: number }[];
  customers_by_module_count: { bucket: string; count: number }[];
}

export interface CustomerFeatureFilters {
  search?: string;
  industry?: string;
  plan?: string;
  status?: string;
  subscription_status?: string;
  is_trial?: boolean;
  country?: string;
}

function toQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export function getCatalog(): Promise<{ categories: Record<FeatureCategory, string>; modules: unknown[] }> {
  return request('/api/admin/features/catalog');
}

export function getSummary(): Promise<FeatureSummary> {
  return request('/api/admin/features/summary');
}

export function listFeatureCustomers(filters: CustomerFeatureFilters = {}): Promise<CustomerFeaturePanelItem[]> {
  return request(`/api/admin/features/customers${toQuery({ ...filters })}`);
}

export function getAnalytics(): Promise<FeatureAnalytics> {
  return request('/api/admin/features/analytics');
}

export function getFeatureFlags(tenantId: string): Promise<TenantFeatureItem[]> {
  return request(`/api/admin/customers/${tenantId}/features`);
}

export function getFeatureImpact(tenantId: string, moduleKey: string, targetStatus: FlagStatus): Promise<FeatureImpact> {
  return request(`/api/admin/customers/${tenantId}/features/${moduleKey}/impact?target_status=${targetStatus}`);
}

export function updateFeatureFlag(tenantId: string, moduleKey: string, payload: FeatureUpdatePayload): Promise<TenantFeatureItem> {
  return request(`/api/admin/customers/${tenantId}/features/${moduleKey}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function resetFeatures(tenantId: string): Promise<void> {
  return request(`/api/admin/customers/${tenantId}/features/reset`, { method: 'POST' });
}

export function bulkUpdateFeature(
  tenantIds: string[],
  moduleKey: string,
  status: FlagStatus,
  reason?: string,
): Promise<BulkUpdateResult> {
  return request('/api/admin/features/bulk-update', {
    method: 'POST',
    body: JSON.stringify({ tenant_ids: tenantIds, module_key: moduleKey, status, reason }),
  });
}

export function listTemplates(): Promise<FeatureTemplateItem[]> {
  return request('/api/admin/features/templates');
}

export function createTemplate(
  name: string,
  description: string | undefined,
  modules: FeatureTemplateModule[],
): Promise<FeatureTemplateItem> {
  return request('/api/admin/features/templates', {
    method: 'POST',
    body: JSON.stringify({ name, description, modules }),
  });
}

export function deleteTemplate(templateId: string): Promise<void> {
  return request(`/api/admin/features/templates/${templateId}`, { method: 'DELETE' });
}

export function assignTemplate(templateId: string, tenantIds: string[], reason?: string): Promise<BulkUpdateResult> {
  return request(`/api/admin/features/templates/${templateId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ tenant_ids: tenantIds, reason }),
  });
}

export function getFeatureHistory(tenantId: string, moduleKey?: string): Promise<FeatureHistoryItem[]> {
  return request(`/api/admin/customers/${tenantId}/features/history${toQuery({ module_key: moduleKey })}`);
}

export function rollbackFeature(tenantId: string, historyId: string): Promise<TenantFeatureItem> {
  return request(`/api/admin/customers/${tenantId}/features/history/${historyId}/rollback`, { method: 'POST' });
}

export function listSchedules(tenantId: string): Promise<FeatureScheduleItem[]> {
  return request(`/api/admin/customers/${tenantId}/features/schedules`);
}

export function createSchedule(
  tenantId: string,
  moduleKey: string,
  action: FlagStatus,
  scheduledFor: string,
): Promise<FeatureScheduleItem> {
  return request(`/api/admin/customers/${tenantId}/features/schedules`, {
    method: 'POST',
    body: JSON.stringify({ module_key: moduleKey, action, scheduled_for: scheduledFor }),
  });
}

export function cancelSchedule(tenantId: string, scheduleId: string): Promise<void> {
  return request(`/api/admin/customers/${tenantId}/features/schedules/${scheduleId}`, { method: 'DELETE' });
}
