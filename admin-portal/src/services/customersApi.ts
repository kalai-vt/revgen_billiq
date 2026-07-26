import { request } from '@/lib/api-client';

export interface AdminCustomerListItem {
  tenant_id: string;
  company_name: string;
  owner_name: string | null;
  owner_email: string;
  plan: string;
  status: string;
  total_invoices: number;
  total_users: number;
  last_login: string | null;
  created_at: string;
}

export interface AdminCustomerProfile {
  tenant_id: string;
  company_name: string;
  legal_name: string;
  email: string;
  phone: string;
  country: string;
  status: string;
  plan: string;
  created_at: string;
  owner_name: string | null;
  owner_email: string;
  total_users: number;
  total_invoices: number;
  total_customers: number;
  monthly_revenue: number;
  outstanding_amount: number;
  last_login: string | null;
}

export function listCustomers(params: { search?: string; status?: string } = {}): Promise<AdminCustomerListItem[]> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/admin/customers${suffix}`);
}

export function getCustomer(tenantId: string): Promise<AdminCustomerProfile> {
  return request(`/api/admin/customers/${tenantId}`);
}

export function suspendCustomer(tenantId: string): Promise<void> {
  return request(`/api/admin/customers/${tenantId}/suspend`, { method: 'POST' });
}

export function activateCustomer(tenantId: string): Promise<void> {
  return request(`/api/admin/customers/${tenantId}/activate`, { method: 'POST' });
}

export function resetCustomerPassword(tenantId: string): Promise<void> {
  return request(`/api/admin/customers/${tenantId}/reset-password`, { method: 'POST' });
}
