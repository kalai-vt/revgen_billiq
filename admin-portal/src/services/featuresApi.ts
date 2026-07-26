import { request } from '@/lib/api-client';

export interface FeatureFlagItem {
  module_key: string;
  label: string;
  enabled: boolean;
  available: boolean;
}

export function getFeatureFlags(tenantId: string): Promise<FeatureFlagItem[]> {
  return request(`/api/admin/customers/${tenantId}/features`);
}

export function updateFeatureFlag(tenantId: string, moduleKey: string, enabled: boolean): Promise<void> {
  return request(`/api/admin/customers/${tenantId}/features`, {
    method: 'PUT',
    body: JSON.stringify({ module_key: moduleKey, enabled }),
  });
}
