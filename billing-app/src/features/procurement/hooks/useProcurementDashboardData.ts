import { useQuery } from '@tanstack/react-query';
import * as procurementApi from '@/features/procurement/api';
import type { DateRange } from '@/lib/date-range';

export function useProcurementDashboardData(range: DateRange) {
  return useQuery({
    queryKey: ['procurement-dashboard', range.from, range.to],
    queryFn: () => procurementApi.getProcurementDashboard(range.from, range.to),
  });
}
