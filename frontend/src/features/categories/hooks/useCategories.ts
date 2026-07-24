import { useQuery } from '@tanstack/react-query';
import * as categoriesApi from '@/features/categories/api';

export function useCategories(params?: categoriesApi.CategoryListParams) {
  return useQuery({
    queryKey: ['categories', params],
    queryFn: () => categoriesApi.listCategories(params),
  });
}
