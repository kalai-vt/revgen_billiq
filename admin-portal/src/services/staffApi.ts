import { request } from '@/lib/api-client';
import type { AdminRole } from '@/services/authApi';

export interface AdminStaff {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: AdminRole;
  status: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login: string | null;
  created_at: string;
}

export function listStaff(): Promise<AdminStaff[]> {
  return request('/api/admin/staff');
}

export function inviteStaff(payload: { first_name: string; last_name: string; email: string; role: AdminRole }): Promise<AdminStaff> {
  return request('/api/admin/staff/invite', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateStaffRole(id: string, role: AdminRole): Promise<AdminStaff> {
  return request(`/api/admin/staff/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
}

export function deactivateStaff(id: string): Promise<AdminStaff> {
  return request(`/api/admin/staff/${id}/deactivate`, { method: 'POST' });
}

export function activateStaff(id: string): Promise<AdminStaff> {
  return request(`/api/admin/staff/${id}/activate`, { method: 'POST' });
}

export function acceptInvite(token: string, password: string): Promise<void> {
  return request('/api/admin/auth/accept-invite', { method: 'POST', body: JSON.stringify({ token, password }) });
}

export function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  return request('/api/admin/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}
