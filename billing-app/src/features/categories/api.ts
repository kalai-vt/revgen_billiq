import { request } from '@/lib/api-client';

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryPayload {
  name: string;
  description?: string | null;
}

export type CategorySortField = 'name' | 'created_at';

export interface CategoryListParams {
  sort_by?: CategorySortField;
  sort_dir?: 'asc' | 'desc';
}

export function listCategories(params?: CategoryListParams): Promise<{ items: Category[] }> {
  const search = new URLSearchParams();
  if (params?.sort_by) search.set('sort_by', params.sort_by);
  if (params?.sort_dir) search.set('sort_dir', params.sort_dir);
  const query = search.toString();
  return request(`/api/categories${query ? `?${query}` : ''}`);
}

export function createCategory(payload: CategoryPayload): Promise<Category> {
  return request('/api/categories', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateCategory(id: string, payload: Partial<CategoryPayload> & { is_active?: boolean }): Promise<Category> {
  return request(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteCategory(id: string): Promise<void> {
  return request(`/api/categories/${id}`, { method: 'DELETE' });
}
