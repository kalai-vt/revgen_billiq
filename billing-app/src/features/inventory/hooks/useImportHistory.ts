import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as inventoryApi from '@/features/inventory/api';

export function useImportHistory(page: number, pageSize = 20) {
  return useQuery({
    queryKey: ['import-history', page, pageSize],
    queryFn: () => inventoryApi.listImportHistory(page, pageSize),
    placeholderData: keepPreviousData,
  });
}
