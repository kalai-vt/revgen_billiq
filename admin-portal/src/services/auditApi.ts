import { request } from '@/lib/api-client';

export interface AuditLogEntry {
  id: string;
  admin_user_id: string;
  admin_user_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
}

export function listAuditLogs(
  params: { action?: string; target_type?: string; limit?: number; offset?: number } = {},
): Promise<AuditLogPage> {
  const query = new URLSearchParams();
  if (params.action) query.set('action', params.action);
  if (params.target_type) query.set('target_type', params.target_type);
  query.set('limit', String(params.limit ?? 50));
  query.set('offset', String(params.offset ?? 0));
  return request(`/api/admin/audit-logs?${query.toString()}`);
}

export function listAuditActions(): Promise<string[]> {
  return request('/api/admin/audit-logs/actions');
}
