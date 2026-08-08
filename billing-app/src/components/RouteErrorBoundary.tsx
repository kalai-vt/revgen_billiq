import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { ErrorFallback } from '@/components/ErrorBoundary';
import { RELOAD_GUARD_KEY } from '@/lib/chunkReload';

const CHUNK_LOAD_ERROR_PATTERN = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

/**
 * Router-level `errorElement`, set once on the root route in routes/router.tsx so it covers every
 * route in the tree. registerChunkErrorRecovery() (src/lib/chunkReload.ts) already handles the
 * common "stale chunk after a new deploy" case via Vite's `vite:preloadError` event and reloads
 * before this ever renders; this is the fallback for whatever that doesn't catch (e.g. the error
 * surfaces as a route-render throw rather than a preload event) plus any other route-render error.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? error.statusText
    : error instanceof Error
      ? error.message
      : String(error);

  if (CHUNK_LOAD_ERROR_PATTERN.test(message) && !sessionStorage.getItem(RELOAD_GUARD_KEY)) {
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
    window.location.reload();
    return null;
  }

  console.error(error);
  const normalizedError = error instanceof Error ? error : new Error(message);
  return <ErrorFallback error={normalizedError} />;
}
