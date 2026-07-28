/** The app's base path in production (Vercel serves billing-app under /billiq — see
 * `vite.config.ts`'s `base` and `routes/router.tsx`'s `basename`). React Router's `basename`
 * only rewrites paths it generates itself (`<Link>`, `navigate()`) — a raw `window.open(path)`
 * bypasses the router entirely and needs this prefix added manually, or it resolves against the
 * site root and 404s in production. */
export const APP_BASE_PATH = import.meta.env.PROD ? '/billiq' : '';

export function appPath(path: string): string {
  return `${APP_BASE_PATH}${path}`;
}
