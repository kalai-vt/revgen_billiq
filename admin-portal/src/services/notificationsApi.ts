import { request } from '@/lib/api-client';

export interface AdminNotification {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical' | string;
  title: string;
  message: string;
  tenant_id: string | null;
  created_at: string;
  is_read: boolean;
}

export function listNotifications(): Promise<AdminNotification[]> {
  return request('/api/admin/notifications');
}

export function getUnreadCount(): Promise<{ count: number }> {
  return request('/api/admin/notifications/unread-count');
}

export function markNotificationRead(id: string): Promise<void> {
  return request(`/api/admin/notifications/${id}/read`, { method: 'POST' });
}

export function markAllNotificationsRead(): Promise<void> {
  return request('/api/admin/notifications/read-all', { method: 'POST' });
}
