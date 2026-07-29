import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFeatureFlags } from '@/features/settings/hooks/useFeatureFlags';

interface RequireModuleProps {
  /** Catalog module key from the Admin Portal's Feature Management page. */
  moduleKey: string;
  /** Shown in the blocked-state heading, e.g. "Products". */
  label: string;
  children: ReactNode;
}

/**
 * Route-level gate mirroring `isLeafVisible`'s nav-hiding logic (billing-app/src/components/layout
 * /sidebar/nav-config.ts) — hiding the sidebar link isn't enough on its own, since a bookmarked or
 * typed URL still reaches the page directly. Wrap a route's element with this so disabling a
 * module in the Admin Portal blocks the page itself, not just its nav entry.
 *
 * Waits for the feature-flags fetch to resolve before deciding — on a cold load, rendering the
 * real page (or the blocked screen) off the "defaults to enabled" value before this query
 * resolves would flash a disabled module's actual content for one round-trip, same class of bug
 * as the sidebar flicker this mirrors (see SidebarNav.tsx).
 */
export function RequireModule({ moduleKey, label, children }: RequireModuleProps) {
  const { data: flags, isLoading } = useFeatureFlags();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full max-w-xl" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const enabled = flags?.[moduleKey] !== false;
  if (!enabled) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
        <p className="text-sm text-muted-foreground">
          This module isn't enabled for your account. Contact your administrator if you believe this is a mistake.
        </p>
        <Button variant="outline" nativeButton={false} render={<Link to="/settings">Go to Settings</Link>} />
      </div>
    );
  }

  return <>{children}</>;
}
