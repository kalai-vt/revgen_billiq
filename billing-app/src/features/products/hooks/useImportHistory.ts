import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as productsApi from '@/features/products/api';

export function useImportHistory(page: number, pageSize = 20) {
  return useQuery({
    queryKey: ['products-import-history', page, pageSize],
    queryFn: () => productsApi.listImportHistory(page, pageSize),
    placeholderData: keepPreviousData,
  });
}
