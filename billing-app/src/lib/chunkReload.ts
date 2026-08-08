/**
 * After a new deploy, a tab left open (or a stale HTML cache) can still reference asset hashes
 * from the previous build. Vercel's SPA fallback rewrite (see root vercel.json) serves index.html
 * with a 200 for any `/billiq/assets/*` path that no longer exists rather than a 404, so the
 * browser's module loader gets HTML where it expected JS and throws "Failed to fetch dynamically
 * imported module". Vite emits `vite:preloadError` for exactly this case — recover by doing a
 * single hard reload so the browser re-fetches the current index.html and current chunk hashes.
 * Guarded by sessionStorage so a genuinely broken chunk (not just a stale one) doesn't reload-loop.
 */
/** Shared with RouteErrorBoundary, which applies the same guard for chunk-load errors that
 * surface as a route-render throw rather than a `vite:preloadError` event. */
export const RELOAD_GUARD_KEY = 'chunk-reload-attempted';

export function registerChunkErrorRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();

    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      // Already tried once and it's still failing — a reload won't fix it (real network issue or
      // a genuinely broken chunk), so let it surface as a real error instead of loop-reloading.
      return;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
    window.location.reload();
  });

  // Once the app has been stable for a bit post-reload, drop the guard so a *later* deploy can
  // still trigger an automatic recovery instead of permanently falling back to the error page.
  window.addEventListener('load', () => {
    setTimeout(() => sessionStorage.removeItem(RELOAD_GUARD_KEY), 10_000);
  });
}
