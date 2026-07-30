import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as settingsApi from '@/features/settings/api';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarNav } from '@/components/layout/sidebar/SidebarNav';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const COLLAPSED_KEY = 'revgeniq_sidebar_collapsed';

/** Tenant's own icon slot when they haven't uploaded a custom logo yet — deliberately distinct
 * from `BrandLogo`'s fallback mark so a tenant without a logo doesn't just show a second copy
 * of the RevGen BillIQ product branding directly underneath the first. */
function TenantInitialMark({ name, className }: { name?: string | null; className?: string }) {
  return (
    <div
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground',
        className,
      )}
    >
      {name?.trim()?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

interface SidebarProps {
  /** `mobile` renders inside the slide-out drawer: always full-width, no collapse toggle,
   * and closes the drawer (`onNavigate`) after a link is clicked. */
  variant?: 'desktop' | 'mobile';
  onNavigate?: () => void;
}

export function Sidebar({ variant = 'desktop', onNavigate }: SidebarProps) {
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();
  const { data: branding } = useQuery({ queryKey: ['branding'], queryFn: settingsApi.getBranding });
  const [collapsed, setCollapsed] = useState(() => variant === 'desktop' && localStorage.getItem(COLLAPSED_KEY) === '1');

  const isCollapsed = variant === 'desktop' && collapsed;

  async function handleSignOut() {
    await logout();
    navigate('/signed-out');
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-background transition-[width] duration-200 ease-out',
        variant === 'desktop' ? cn('border-r', isCollapsed ? 'w-16' : 'w-64') : 'w-full',
      )}
    >
      {/* Product branding — always RevGen BillIQ, identical for every tenant, never clickable */}
      <div className={cn('shrink-0 border-b px-4 py-3.5', isCollapsed && 'flex justify-center px-2')}>
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger
              // Intentional: focusing this non-interactive wrapper is how keyboard users reveal
              // the tooltip; there is no click/activation behavior to mislead assistive tech about.
              render={
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                <div tabIndex={0} className="outline-none"><BrandLogo logoUrl={null} size="sm" iconOnly /></div>
              }
            />
            <TooltipContent side="right">RevGen BillIQ</TooltipContent>
          </Tooltip>
        ) : (
          <BrandLogo logoUrl={null} size="sm" textClassName="text-base" />
        )}
      </div>

      {/* Tenant branding — below product branding, changes per tenant */}
      <div className={cn('flex shrink-0 items-center gap-2 px-4 py-4', isCollapsed && 'flex-col justify-center px-2')}>
        <div className={cn('min-w-0 flex-1', isCollapsed && 'flex justify-center')}>
          {branding?.logo_url ? (
            <BrandLogo logoUrl={branding.logo_url} size="sm" iconOnly={isCollapsed} />
          ) : (
            <TenantInitialMark name={tenant?.company_name} />
          )}
          {!isCollapsed && tenant?.company_name && (
            <div className="mt-2 min-w-0">
              <Tooltip>
                <TooltipTrigger
                  render={
                    // Intentional: focusing this non-interactive wrapper is how keyboard users
                    // reveal the tooltip; there is no click/activation behavior to mislead
                    // assistive tech about.
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                    <p tabIndex={0} className="truncate text-sm font-semibold tracking-tight text-foreground outline-none">
                      {tenant.company_name}
                    </p>
                  }
                />
                <TooltipContent side="bottom" align="start">
                  {tenant.company_name}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
        {variant === 'desktop' && (
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('shrink-0 text-muted-foreground', isCollapsed && 'mt-1')}
            onClick={toggleCollapsed}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        )}
      </div>

      {/* Navigation — the only scrollable section */}
      <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        <SidebarNav collapsed={isCollapsed} onNavigate={onNavigate} onRequestSidebarExpand={() => setCollapsed(false)} />
      </div>

      {/* Profile — fixed bottom */}
      <div className={cn('shrink-0 border-t p-2', isCollapsed && 'flex justify-center')}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              isCollapsed ? (
                <button
                  className="flex size-10 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                  aria-label={`${user?.first_name} ${user?.last_name} — account menu`}
                >
                  <Avatar className="size-8">
                    {user?.avatar_url && <AvatarImage src={user.avatar_url} alt="Avatar" />}
                    <AvatarFallback>{user?.first_name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
                  </Avatar>
                </button>
              ) : (
                <button className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted">
                  <Avatar className="size-8">
                    {user?.avatar_url && <AvatarImage src={user.avatar_url} alt="Avatar" />}
                    <AvatarFallback>{user?.first_name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-tight">
                      {user?.first_name} {user?.last_name}
                    </span>
                    <span className="block text-xs capitalize leading-tight text-muted-foreground">{user?.role}</span>
                  </span>
                </button>
              )
            }
          />
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuItem render={<NavLink to="/settings" onClick={onNavigate}>Profile &amp; settings</NavLink>} />
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
