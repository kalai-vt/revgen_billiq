import { request } from '@/lib/api-client';

export interface DbHealth {
  ok: boolean;
  latency_ms: number | null;
  error?: string;
}

export interface SystemHealth {
  billing_db: DbHealth;
  admin_db: DbHealth;
  api_ok: boolean;
  uptime_seconds: number;
  process_started_at: string;
  checked_at: string;
}

export function getSystemHealth(): Promise<SystemHealth> {
  return request('/api/admin/system/health');
}

export function getRecentActivity() {
  return request('/api/admin/system/activity');
}
