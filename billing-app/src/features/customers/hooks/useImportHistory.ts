import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as customersApi from '@/features/customers/api';

export function useImportHistory(page: number, pageSize = 20) {
  return useQuery({
    queryKey: ['customers-import-history', page, pageSize],
    queryFn: () => customersApi.listImportHistory(page, pageSize),
    placeholderData: keepPreviousData,
  });
}
