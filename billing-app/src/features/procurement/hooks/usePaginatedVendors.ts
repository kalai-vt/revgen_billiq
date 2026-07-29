import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as procurementApi from '@/features/procurement/api';

export function usePaginatedVendors(params: procurementApi.VendorListParams) {
  return useQuery({
    queryKey: ['procurement-vendors', params],
    queryFn: () => procurementApi.listVendors(params),
    placeholderData: keepPreviousData,
  });
}
