import { useQuery } from '@tanstack/react-query';
import * as settingsApi from '@/features/settings/api';

/** The map that decides which modules exist for this tenant.
 *
 * Retried harder than an ordinary query on purpose. Everything below fails *closed* — a module
 * whose flag we cannot read is treated as off — so a single network blip would otherwise hide a
 * customer's own modules until they reloaded. Retrying with backoff turns the common blip into a
 * slightly longer skeleton instead of a wrong sidebar in either direction.
 *
 * Same queryKey/staleTime everywhere so the sidebar, the route guards and every page share one
 * cached request instead of refetching per consumer.
 */
export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags'],
    queryFn: settingsApi.getFeatureFlags,
    staleTime: 60_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4_000),
  });
}

/** Whether this tenant may use a module.
 *
 * Three different "unknown"s, deliberately answered the same way — not enabled:
 *
 *  - Key absent from a *loaded* map -> enabled. A module with no admin override is on, which is
 *    what keeps a tenant who has never been touched by Feature Management seeing the whole app.
 *
 *  - Flags not loaded yet -> NOT enabled. Reporting enabled here is why a disabled module used
 *    to appear for the one round-trip before the flags arrived and then vanish: the customer saw
 *    something they do not have.
 *
 *  - Flags *failed* to load -> NOT enabled. This is the one that shipped the bug: on an error the
 *    query is no longer pending, so anything gating on `isLoading` moved straight to rendering
 *    with `data === undefined`, and an undefined map read as "every module is on". A customer
 *    with modules disabled in the Admin Portal saw the entire product until they reloaded.
 */
export function useFeatureFlag(moduleKey: string): boolean {
  const { data } = useFeatureFlags();
  if (!data) return false;
  return data[moduleKey] !== false;
}

/** For callers that want to render a skeleton rather than nothing while the answer is unknown. */
export function useFeatureFlagState(moduleKey: string): { enabled: boolean; isLoading: boolean } {
  const { data, isPending } = useFeatureFlags();
  return { enabled: !!data && data[moduleKey] !== false, isLoading: isPending };
}
