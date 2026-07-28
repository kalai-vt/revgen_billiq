import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useFeatureFlag } from '@/features/settings/hooks/useFeatureFlags';

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
 */
export function RequireModule({ moduleKey, label, children }: RequireModuleProps) {
  const enabled = useFeatureFlag(moduleKey);

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
