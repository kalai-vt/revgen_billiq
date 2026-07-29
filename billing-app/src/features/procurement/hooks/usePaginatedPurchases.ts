import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as procurementApi from '@/features/procurement/api';

export function usePaginatedPurchases(params: procurementApi.PurchaseEntryListParams) {
  return useQuery({
    queryKey: ['procurement-purchases', params],
    queryFn: () => procurementApi.listPurchases(params),
    placeholderData: keepPreviousData,
  });
}
