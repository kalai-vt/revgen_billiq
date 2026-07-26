import { request } from '@/lib/api-client';

export type AdminRole = 'super_admin' | 'operations' | 'support' | 'finance' | 'sales' | 'developer' | 'auditor';

export interface AdminUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: AdminRole;
  status: string;
  last_login: string | null;
  created_at: string;
}

export interface AdminAuthResult {
  access_token: string;
  refresh_token: string;
  admin_user: AdminUser;
}

export function login(email: string, password: string): Promise<AdminAuthResult> {
  return request('/api/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function me(): Promise<AdminUser> {
  return request('/api/admin/auth/me');
}

export function logout(refreshToken: string): Promise<void> {
  return request('/api/admin/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
}
