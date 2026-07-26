import { useQuery } from '@tanstack/react-query';
import * as analyticsApi from '@/features/analytics/api';

export function useDashboardData(days: number, advanced = false) {
  return useQuery({
    queryKey: ['analytics-dashboard', days, advanced],
    queryFn: () => analyticsApi.getDashboard(days, advanced),
  });
}
