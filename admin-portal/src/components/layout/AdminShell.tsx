import { Suspense, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import { AdminBrandLogo } from '@/components/shared/AdminBrandLogo';
import { AdminNotificationBell } from '@/components/layout/AdminNotificationBell';
import { AdminSidebarNav } from '@/components/layout/AdminSidebarNav';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Avatar, AvatarFallback } from '@shared/components/ui/avatar';
import { Button } from '@shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shared/components/ui/dropdown-menu';
import { Sheet, SheetContent } from '@shared/components/ui/sheet';
import { Skeleton } from '@shared/components/ui/skeleton';

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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { adminUser, logout } = useAdminAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex h-full w-64 flex-col bg-background">
      <div className="shrink-0 border-b px-4 py-3.5">
        <AdminBrandLogo size="sm" />
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <AdminSidebarNav onNavigate={onNavigate} />
      </div>
      <div className="shrink-0 border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted">
                <Avatar className="size-8">
                  <AvatarFallback>{adminUser?.first_name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium leading-tight">
                    {adminUser?.first_name} {adminUser?.last_name}
                  </span>
                  <span className="block text-xs capitalize leading-tight text-muted-foreground">
                    {adminUser?.role.replace('_', ' ')}
                  </span>
                </span>
              </button>
            }
          />
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuItem render={<NavLink to="/settings">Profile &amp; settings</NavLink>} />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleSignOut()}>
              <LogOut className="mr-2 size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function AdminShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-muted/20">
      <aside className="hidden shrink-0 border-r md:block">
        <SidebarContent />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent showCloseButton={false} className="p-0">
          <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b bg-background px-4 py-3 md:px-6">
          <div className="flex items-center md:hidden">
            <Button variant="ghost" size="icon" aria-label="Open navigation menu" onClick={() => setMobileNavOpen(true)}>
              <Menu className="size-5" />
            </Button>
          </div>
          <div className="flex-1 text-sm font-medium text-muted-foreground">RevGenIQ Internal Admin Portal</div>
          <AdminNotificationBell />
        </header>

        <main className="flex-1 overflow-y-auto overscroll-contain scroll-smooth p-4 md:p-6">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
