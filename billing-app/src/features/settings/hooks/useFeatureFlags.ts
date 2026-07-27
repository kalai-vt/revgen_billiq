import { useQuery } from '@tanstack/react-query';
import * as settingsApi from '@/features/settings/api';

/** Same queryKey/staleTime as SidebarNav's fetch, so this and the sidebar share one cached
 * request instead of doubling up on every page that needs a flag. */
export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags'],
    queryFn: settingsApi.getFeatureFlags,
    staleTime: 60_000,
  });
}

/** Feature flags default to enabled when absent (matches nav-config.ts's isLeafVisible). */
export function useFeatureFlag(moduleKey: string): boolean {
  const { data } = useFeatureFlags();
  return data?.[moduleKey] !== false;
}
