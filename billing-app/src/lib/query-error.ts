import { ApiError } from '@/lib/api-client';

/** The shared shape for turning a failed query/mutation into a message a user can actually
 * read, instead of letting `data` stay `undefined` and rendering a misleading "0"/"empty"
 * state as if the request had succeeded with no results. See CustomerDetailPage.tsx for the
 * pattern this was promoted from. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}
