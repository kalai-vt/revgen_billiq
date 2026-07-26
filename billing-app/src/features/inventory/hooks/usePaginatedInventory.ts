import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as inventoryApi from '@/features/inventory/api';

export function usePaginatedInventory(params: inventoryApi.InventoryListParams) {
  return useQuery({
    queryKey: ['inventory', params],
    queryFn: () => inventoryApi.listInventory(params),
    placeholderData: keepPreviousData,
  });
}
