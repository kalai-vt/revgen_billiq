import { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useInactivityLogout } from '@/features/auth/hooks/useInactivityLogout';
import { createScrollRestoration } from '@/hooks/useScrollRestoration';
import { useGlobalSearchShortcut } from '@/hooks/useGlobalSearchShortcut';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { GlobalSearchInput } from '@/components/layout/GlobalSearchInput';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { Sidebar } from '@/components/layout/Sidebar';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

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

  return (
    <div className="flex h-screen overflow-hidden bg-muted/20">
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
  );
}
