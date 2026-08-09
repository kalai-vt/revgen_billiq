import { Suspense, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { useInactivityLogout } from '@/features/auth/hooks/useInactivityLogout';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as plansApi from '@/features/plans/api';
import { BLOCKING_SUBSCRIPTION_STATUSES } from '@/features/plans/api';
import { createScrollRestoration } from '@/hooks/useScrollRestoration';
import { useGlobalSearchShortcut } from '@/hooks/useGlobalSearchShortcut';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { GlobalSearchInput } from '@/components/layout/GlobalSearchInput';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { PageActionsProvider } from '@/components/layout/pageActions';
import { Sidebar } from '@/components/layout/Sidebar';
import { SubscriptionRequiredScreen } from '@/components/layout/SubscriptionRequiredScreen';
import { TrialBanner } from '@/components/layout/TrialBanner';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useSubscriptionGateStore } from '@/lib/subscriptionGateStore';

const useMainScrollRestoration = createScrollRestoration();
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

function PageSkeleton() {
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

export function AppShell() {
  useInactivityLogout(INACTIVITY_TIMEOUT_MS);
  useGlobalSearchShortcut();
  const scrollRef = useMainScrollRestoration<HTMLElement>();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { tenant } = useAuth();

  // Single query, two consumers: the trial banner (subscription_status === 'trialing') and the
  // proactive suspension check below. /api/billing/usage is exempt from subscription enforcement
  // (see app/core/subscription_access.py's SUBSCRIPTION_ACCESS_EXEMPT_PREFIXES), so it always
  // resolves with the tenant's real status even while every other endpoint is 402ing.
  const { data: usage } = useQuery({ queryKey: ['billing-usage'], queryFn: plansApi.getUsage });

  const blocked = useSubscriptionGateStore((state) => state.blocked);
  const gateInfo = useSubscriptionGateStore((state) => state.info);
  const setBlocked = useSubscriptionGateStore((state) => state.setBlocked);
  const clearBlocked = useSubscriptionGateStore((state) => state.clear);

  // Proactive check on mount/refetch — catches a tenant who is ALREADY suspended/expired before
  // their first blocked API call would otherwise surface a reactive 402 (see api-client.ts's
  // `request()`, which populates this same store on that path). Without this, a suspended tenant
  // would briefly see the normal app shell (and its pages' queries would start firing) until the
  // first 402 landed.
  useEffect(() => {
    if (!usage) return;
    if (BLOCKING_SUBSCRIPTION_STATUSES.includes(usage.subscription_status)) {
      setBlocked({
        message: 'Your trial has ended. Please subscribe to continue using BillIQ.',
        subscriptionStatus: usage.subscription_status,
        suspensionReason: null,
      });
    } else {
      clearBlocked();
    }
  }, [usage, setBlocked, clearBlocked]);

  if (blocked) {
    return <SubscriptionRequiredScreen info={gateInfo} />;
  }

  return (
    <PageActionsProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-muted/20">
        {usage?.subscription_status === 'trialing' && usage.trial_ends_at && tenant && (
          <TrialBanner tenantId={tenant.id} trialEndsAt={usage.trial_ends_at} />
        )}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="hidden shrink-0 md:block">
            <Sidebar variant="desktop" />
          </aside>

          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetContent showCloseButton={false} className="p-0">
              <Sidebar variant="mobile" onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b bg-background px-4 py-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(20rem,32rem)_minmax(0,1fr)] md:px-6">
              <div className="col-start-1 flex items-center md:hidden">
                <IconButton tooltip="Open Menu" aria-label="Open navigation menu" onClick={() => setMobileNavOpen(true)}>
                  <Menu className="size-5" />
                </IconButton>
              </div>
              <div className="col-start-2">
                <GlobalSearchInput />
              </div>
              <div className="col-start-3 flex items-center justify-end gap-3">
                <NotificationBell />
              </div>
            </header>

            <Breadcrumbs />

            <main ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain scroll-smooth p-4 md:p-6">
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            </main>
          </div>
        </div>
      </div>
    </PageActionsProvider>
  );
}
