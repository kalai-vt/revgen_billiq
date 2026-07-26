import { request } from '@/lib/api-client';

export interface ActivityLogEntry {
  id: string;
  module: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string;
  user_id: string | null;
  user_name: string;
  created_at: string;
}

export interface ActivityLogListParams {
  page: number;
  page_size?: number;
  module?: string;
  date_from?: string;
  date_to?: string;
}

export interface ActivityLogListResult {
  items: ActivityLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

export function listActivityLog(params: ActivityLogListParams): Promise<ActivityLogListResult> {
  const search = new URLSearchParams();
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size ?? 20));
  if (params.module) search.set('module', params.module);
  if (params.date_from) search.set('date_from', params.date_from);
  if (params.date_to) search.set('date_to', params.date_to);
  return request(`/api/activity-log?${search.toString()}`);
}
