import { request } from '@/lib/api-client';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResult {
  items: Notification[];
  total: number;
  unread_count: number;
}

export function listNotifications(unreadOnly = false): Promise<NotificationListResult> {
  return request(`/api/notifications${unreadOnly ? '?unread_only=true' : ''}`);
}

export function markNotificationRead(id: string): Promise<Notification> {
  return request(`/api/notifications/${id}/read`, { method: 'POST' });
}

export function markAllNotificationsRead(): Promise<void> {
  return request('/api/notifications/read-all', { method: 'POST' });
}
