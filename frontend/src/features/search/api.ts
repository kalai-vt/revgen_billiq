import { request } from '@/lib/api-client';

export interface SearchResultItem {
  id: string;
  label: string;
  subtitle: string | null;
}

export interface GlobalSearchResult {
  products: SearchResultItem[];
  customers: SearchResultItem[];
  inventory: SearchResultItem[];
  invoices: SearchResultItem[];
  categories: SearchResultItem[];
}

export function globalSearch(q: string): Promise<GlobalSearchResult> {
  return request(`/api/search?q=${encodeURIComponent(q)}`);
}
