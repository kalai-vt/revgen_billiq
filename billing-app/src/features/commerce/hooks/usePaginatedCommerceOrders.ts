import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as commerceApi from '@/features/commerce/api';

export function usePaginatedCommerceOrders(params: commerceApi.CommerceOrderListParams) {
  return useQuery({
    queryKey: ['commerce-orders', params],
    queryFn: () => commerceApi.listOrders(params),
    placeholderData: keepPreviousData,
  });
}
