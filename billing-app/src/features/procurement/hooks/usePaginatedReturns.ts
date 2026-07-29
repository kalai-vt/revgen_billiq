import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as procurementApi from '@/features/procurement/api';

export function usePaginatedReturns(params: procurementApi.PurchaseReturnListParams) {
  return useQuery({
    queryKey: ['procurement-returns', params],
    queryFn: () => procurementApi.listReturns(params),
    placeholderData: keepPreviousData,
  });
}
