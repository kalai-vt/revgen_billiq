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
 * Decides only from a flag map it actually has. "Absent key means enabled" is correct within a
 * *loaded* map, but applied to a map that is still arriving — or that failed to arrive — it
 * renders a disabled module's real content. Pending gets a skeleton; a failed fetch says so and
 * offers a retry rather than either opening the page or claiming the module isn't on the account,
 * which would be a guess. Same rule as the sidebar this mirrors (see SidebarNav.tsx).
 */
export function RequireModule({ moduleKey, label, children }: RequireModuleProps) {
  const { data: flags, isPending, isError, refetch } = useFeatureFlags();

  if (isPending) {
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

  if (isError || !flags) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t check which modules are enabled for your account, so this page is closed for now.
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const enabled = flags[moduleKey] !== false;
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
