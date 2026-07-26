import { request } from '@/lib/api-client';

export interface TicketListItem {
  id: string;
  tenant_id: string;
  company_name: string;
  subject: string;
  status: string;
  priority: string;
  assigned_admin_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketMessage {
  id: string;
  author_name: string;
  message: string;
  created_at: string;
}

export interface TicketDetail {
  id: string;
  tenant_id: string;
  company_name: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  created_by_admin_name: string;
  assigned_admin_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  messages: TicketMessage[];
}

export function listTickets(params: { status?: string; priority?: string; tenant_id?: string } = {}): Promise<TicketListItem[]> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.priority) query.set('priority', params.priority);
  if (params.tenant_id) query.set('tenant_id', params.tenant_id);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/admin/tickets${suffix}`);
}

export function createTicket(payload: { tenant_id: string; subject: string; description: string; priority: string }): Promise<TicketDetail> {
  return request('/api/admin/tickets', { method: 'POST', body: JSON.stringify(payload) });
}

export function getTicket(id: string): Promise<TicketDetail> {
  return request(`/api/admin/tickets/${id}`);
}

export function updateTicket(id: string, payload: { status?: string; priority?: string }): Promise<TicketDetail> {
  return request(`/api/admin/tickets/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function addTicketMessage(id: string, message: string): Promise<TicketDetail> {
  return request(`/api/admin/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify({ message }) });
}
