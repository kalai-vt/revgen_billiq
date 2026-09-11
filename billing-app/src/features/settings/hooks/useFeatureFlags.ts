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

/** Whether this tenant may use a module.
 *
 * Two different "unknown"s, deliberately answered differently:
 *
 *  - Key absent from a *loaded* map -> enabled. A module with no admin override is on, which is
 *    what keeps a tenant who has never been touched by Feature Management seeing the whole app.
 *
 *  - Flags not loaded yet -> NOT enabled. Reporting enabled here is why a disabled module used
 *    to appear for the one round-trip before the flags arrived and then vanish: the customer saw
 *    something they do not have. Hiding until we actually know costs a brief pop-in on modules
 *    the tenant does have, which is the cheaper mistake by far.
 */
export function useFeatureFlag(moduleKey: string): boolean {
  const { data, isPending } = useFeatureFlags();
  if (isPending) return false;
  return data?.[moduleKey] !== false;
}

/** For callers that want to render a skeleton rather than nothing while the answer is unknown. */
export function useFeatureFlagState(moduleKey: string): { enabled: boolean; isLoading: boolean } {
  const { data, isPending } = useFeatureFlags();
  return { enabled: !isPending && data?.[moduleKey] !== false, isLoading: isPending };
}
