import * as Sentry from '@sentry/react';

/**
 * Dormant by default: does nothing unless VITE_SENTRY_DSN is set, so this ships with no Sentry
 * account required. Once a DSN is configured, this also wires up `window.__sentryCaptureException`
 * — the soft hook that src/components/ErrorBoundary.tsx calls into, without importing Sentry
 * directly.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // dormant — no DSN configured, do nothing

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });

  // Wrapped (rather than assigned directly) so the global's `unknown`-typed signature — declared
  // ambiently in components/ErrorBoundary.tsx, which deliberately avoids importing Sentry types —
  // stays satisfied regardless of the exact shape of Sentry.captureException's second parameter.
  window.__sentryCaptureException = (error, captureContext) =>
    Sentry.captureException(error, captureContext as Parameters<typeof Sentry.captureException>[1]);
}
