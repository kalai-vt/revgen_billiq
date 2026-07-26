import { request } from '@/lib/api-client';

export type UserRole = 'owner' | 'manager' | 'staff';
export type PhoneType = 'mobile' | 'landline';
export type PlanId = 'basic' | 'explore' | 'advance';

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  first_name: string;
  last_name: string;
  mobile: string | null;
  role: UserRole;
  status: string;
  is_email_verified: boolean;
  avatar_url: string | null;
  created_at: string;
}

export interface Tenant {
  id: string;
  company_name: string;
  legal_name: string;
  email: string;
  phone: string;
  phone_type: PhoneType;
  country: string;
  timezone: string;
  language: string;
  created_at: string;
}

export interface AuthResult {
  access_token: string;
  refresh_token: string;
  user: User;
  tenant?: Tenant;
  plan?: PlanId;
  can_override_price?: boolean;
}

export interface RegisterPayload {
  company_name: string;
  legal_name: string;
  email: string;
  phone: string;
  phone_type: PhoneType;
  password: string;
  first_name: string;
  last_name: string;
}

export interface RegisterResult {
  tenant: Tenant;
  user: User;
}

export interface TenantUpdatePayload {
  company_name?: string;
  phone?: string;
  phone_type?: PhoneType;
  timezone?: string;
}

export interface TeamMemberPayload {
  first_name: string;
  last_name: string;
  email: string;
  mobile?: string;
  password: string;
  role: 'manager' | 'staff';
}

export function login(email: string, password: string, rememberMe: boolean = false): Promise<AuthResult> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, remember_me: rememberMe }),
  });
}

export function register(payload: RegisterPayload): Promise<RegisterResult> {
  return request('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
}

export function verifyEmail(token: string): Promise<void> {
  return request('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
}

export function resendVerification(email: string): Promise<void> {
  return request('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) });
}

export function forgotPassword(email: string): Promise<void> {
  return request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export function me(): Promise<{ user: User; tenant: Tenant; plan: PlanId; can_override_price: boolean }> {
  return request('/api/auth/me');
}

export function logout(refreshToken: string): Promise<void> {
  return request('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
}

export function updateTenant(payload: TenantUpdatePayload): Promise<Tenant> {
  return request('/api/auth/tenant', { method: 'PUT', body: JSON.stringify(payload) });
}

export function listTeamMembers(): Promise<{ items: User[] }> {
  return request('/api/auth/team');
}

export function createTeamMember(payload: TeamMemberPayload): Promise<User> {
  return request('/api/auth/team', { method: 'POST', body: JSON.stringify(payload) });
}

export interface UpdateProfilePayload {
  first_name?: string;
  last_name?: string;
  mobile?: string | null;
}

export function updateProfile(payload: UpdateProfilePayload): Promise<User> {
  return request('/api/auth/me', { method: 'PUT', body: JSON.stringify(payload) });
}

export interface ChangePasswordResult {
  access_token: string;
  refresh_token: string;
  user: User;
}

export function changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
  return request('/api/auth/change-password', {
    method: 'PUT',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export function uploadAvatar(file: File): Promise<User> {
  const formData = new FormData();
  formData.append('file', file);
  return request('/api/auth/me/avatar', { method: 'POST', body: formData });
}

export interface LoginHistoryEntry {
  event_type: string;
  created_at: string;
}

export interface LoginHistoryResult {
  items: LoginHistoryEntry[];
  total: number;
  page: number;
  page_size: number;
}

export function getLoginHistory(page: number, pageSize = 10): Promise<LoginHistoryResult> {
  return request(`/api/auth/me/login-history?page=${page}&page_size=${pageSize}`);
}
