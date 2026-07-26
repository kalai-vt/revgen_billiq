import { request } from '@/lib/api-client';

export interface CommunicationEntry {
  id: string;
  admin_user_name: string;
  subject: string;
  message: string;
  audience_type: string;
  audience_filter: Record<string, unknown> | null;
  recipient_count: number;
  created_at: string;
}

export function listCommunications(): Promise<CommunicationEntry[]> {
  return request('/api/admin/communications');
}

export function sendBroadcast(payload: {
  subject: string;
  message: string;
  audience_type: 'all' | 'plan' | 'tenant';
  plan?: string;
  tenant_id?: string;
}): Promise<CommunicationEntry> {
  return request('/api/admin/communications/broadcast', { method: 'POST', body: JSON.stringify(payload) });
}
