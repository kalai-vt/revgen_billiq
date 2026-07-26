import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as inventoryApi from '@/features/inventory/api';

export function useStockHistory(params: inventoryApi.StockHistoryListParams) {
  return useQuery({
    queryKey: ['stock-history', params],
    queryFn: () => inventoryApi.listStockHistory(params),
    placeholderData: keepPreviousData,
  });
}
