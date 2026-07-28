import { useQuery } from '@tanstack/react-query';
import type { DateRange } from '@/lib/date-range';
import * as analyticsApi from '@/features/analytics/api';

export function useDashboardData(range: DateRange, advanced = false) {
  return useQuery({
    queryKey: ['analytics-dashboard', range.from, range.to, advanced],
    queryFn: () => analyticsApi.getDashboard(range.from, range.to, advanced, range.preset),
  });
}
