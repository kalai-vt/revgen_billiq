import { useQuery } from '@tanstack/react-query';
import * as inventoryApi from '@/features/inventory/api';

export function useInventoryDashboard() {
  return useQuery({ queryKey: ['inventory-dashboard'], queryFn: inventoryApi.getDashboard });
}
