import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as customersApi from '@/features/customers/api';

export function usePaginatedCustomers(params: customersApi.CustomerListParams) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => customersApi.listCustomers(params),
    placeholderData: keepPreviousData,
  });
}
