import { useQuery } from '@tanstack/react-query';
import * as analyticsApi from '@/features/analytics/api';
import type { ComparisonUnit } from '@/features/analytics/api';

export function useTrendComparison(unit: ComparisonUnit) {
  return useQuery({
    queryKey: ['analytics-trend-comparison', unit],
    queryFn: () => analyticsApi.getTrendComparison(unit),
  });
}
