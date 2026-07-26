import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as productsApi from '@/features/products/api';

export function usePaginatedProducts(params: productsApi.ProductListParams) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => productsApi.listProducts(params),
    placeholderData: keepPreviousData,
  });
}
