import { useQuery } from '@tanstack/react-query';
import * as settingsApi from '@/features/settings/api';

export function useProductConfig() {
  return useQuery({ queryKey: ['product-config'], queryFn: settingsApi.getProductConfig });
}
