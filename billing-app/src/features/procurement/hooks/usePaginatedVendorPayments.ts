import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as procurementApi from '@/features/procurement/api';

export function usePaginatedVendorPayments(params: { vendor_id?: string; page: number; page_size: number }) {
  return useQuery({
    queryKey: ['procurement-vendor-payments', params],
    queryFn: () => procurementApi.listVendorPayments(params),
    placeholderData: keepPreviousData,
  });
}
