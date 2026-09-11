import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from '@/components/ui/accordion';
import { AlertTriangle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useFeatureFlags } from '@/features/settings/hooks/useFeatureFlags';
import { cn } from '@/lib/utils';
import { NAV_ENTRIES, isGroup, isLeafVisible, type NavGroup, type NavLeaf } from '@/components/layout/sidebar/nav-config';
import { EXPANDED_GROUPS_KEY, loadExpandedGroups } from '@/components/layout/sidebar/sidebarStorage';

/** Every collapsed-rail icon (top-level links and module icons) renders in one of these so
 * icons land on the same vertical axis with identical spacing, regardless of label length. */
const COLLAPSED_ICON_BOX = 'flex size-10 shrink-0 items-center justify-center rounded-md';

interface SidebarNavProps {
  /** Icon-only rail mode (desktop only — mobile drawer content is always fully expanded). */
  collapsed?: boolean;
  /** Called after a leaf link is clicked — used by the mobile drawer to close itself. */
  onNavigate?: () => void;
  /** Called when a module icon is clicked while collapsed — the parent expands the whole
   * sidebar rail back out; this component takes care of opening that module's accordion. */
  onRequestSidebarExpand?: () => void;
}

function ChildLink({ leaf, onNavigate }: { leaf: NavLeaf; onNavigate?: () => void }) {
  return (
    <NavLink
      to={leaf.to}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-accent font-semibold text-sidebar-foreground'
            : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground',
        )
      }
    >
      <leaf.icon className="size-4 shrink-0" />
      <span className="truncate">{leaf.label}</span>
    </NavLink>
  );
}

function TopLevelLink({ leaf, collapsed, onNavigate }: { leaf: NavLeaf; collapsed: boolean; onNavigate?: () => void }) {
  const link = (
    <NavLink
      to={leaf.to}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'text-sm font-medium transition-colors',
          collapsed
            ? cn(
                COLLAPSED_ICON_BOX,
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )
            : cn(
                'flex items-center gap-2.5 rounded-md border-l-[3px] px-2.5 py-2',
                isActive
                  ? 'border-sidebar-primary-foreground/40 bg-sidebar-primary font-semibold text-sidebar-primary-foreground'
                  : 'border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
              ),
        )
      }
    >
      <leaf.icon className="size-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{leaf.label}</span>}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{leaf.label}</TooltipContent>
    </Tooltip>
  );
}

function ModuleGroup({
  group,
  children,
  collapsed,
  onNavigate,
  onGroupIconClick,
}: {
  group: NavGroup;
  children: NavLeaf[];
  collapsed: boolean;
  onNavigate?: () => void;
  onGroupIconClick?: (groupLabel: string) => void;
}) {
  if (collapsed) {
    const button = (
      <button
        type="button"
        onClick={() => onGroupIconClick?.(group.label)}
        className={cn(COLLAPSED_ICON_BOX, 'text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground')}
        aria-label={`Expand ${group.label}`}
      >
        <group.icon className="size-[18px] shrink-0" />
      </button>
    );
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent side="right">{group.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <AccordionItem value={group.label}>
      <AccordionTrigger className="w-full rounded-md px-2.5 py-2 text-sidebar-foreground/70 hover:bg-sidebar-accent">
        <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
          <group.icon className="size-[18px] shrink-0" />
          <span className="truncate">{group.label}</span>
        </span>
      </AccordionTrigger>
      <AccordionPanel>
        <div className="flex flex-col gap-0.5 py-1 pl-[26px]">
          {children.map((leaf) => (
            <ChildLink key={leaf.to} leaf={leaf} onNavigate={onNavigate} />
          ))}
        </div>
      </AccordionPanel>
    </AccordionItem>
  );
}

export function SidebarNav({ collapsed = false, onNavigate, onRequestSidebarExpand }: SidebarNavProps) {
  const { user, plan } = useAuth();
  const { data: featureFlags, isPending: flagsPending, isError: flagsFailed, refetch: refetchFlags } = useFeatureFlags();

  // Deliberately NOT auto-expanded from the active route and NOT restored across a fresh
  // login — every module starts collapsed after sign-in. Within a session, manually expanding
  // a module still survives a plain page refresh (see the persistence effect below), and
  // authStore.login()/logout() call clearSidebarExpansionState() so state never leaks between
  // different users signing into the same browser.
  const [expanded, setExpanded] = useState<string[]>(loadExpandedGroups);

  useEffect(() => {
    localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify(expanded));
  }, [expanded]);

  function handleGroupIconClick(groupLabel: string) {
    setExpanded((prev) => (prev.includes(groupLabel) ? prev : [...prev, groupLabel]));
    onRequestSidebarExpand?.();
  }

  // The nav is never built from a flag map we do not have. Within a *loaded* map an absent key
  // means enabled (see isLeafVisible), which is what keeps a tenant no admin has ever touched
  // seeing the whole app — but that same default applied to a missing map showed every module in
  // the product. Two ways the map can be missing, and each gets its own screen:
  //
  //   still arriving (cold load, fresh login, a retry in flight) -> skeleton, so nothing wrong
  //   flashes on-screen for the round-trip;
  //
  //   failed outright -> say so and offer a retry. Rendering the nav here is what the customer
  //   actually hit: modules an admin had switched off were listed until a manual page reload
  //   happened to make the request succeed.
  if (flagsPending) {
    return (
      <nav aria-label="Main navigation" className={cn('flex flex-col gap-1.5', collapsed ? 'items-center px-2' : 'px-2.5')}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('bg-sidebar-accent', collapsed ? 'size-10 shrink-0 rounded-md' : 'h-9 w-full rounded-md')}
          />
        ))}
      </nav>
    );
  }

  if (flagsFailed || !featureFlags) {
    return (
      <nav
        aria-label="Main navigation"
        className={cn('flex flex-col items-center gap-2 text-center', collapsed ? 'px-1' : 'px-2.5')}
      >
        <AlertTriangle className="size-5 shrink-0 text-sidebar-foreground/70" aria-hidden />
        {!collapsed && (
          <p className="text-xs leading-snug text-sidebar-foreground/70">
            Couldn&apos;t load your modules.
          </p>
        )}
        <button
          type="button"
          onClick={() => void refetchFlags()}
          className="rounded-md px-2 py-1 text-xs font-medium text-sidebar-foreground/90 underline-offset-2 hover:bg-sidebar-accent hover:underline"
        >
          Retry
        </button>
      </nav>
    );
  }

  const entries = NAV_ENTRIES.map((entry) => {
    if (isGroup(entry)) {
      const children = entry.children.filter((leaf) => isLeafVisible(leaf, user?.role, plan, featureFlags));
      if (children.length === 0) return null;
      return { entry, children };
    }
    if (!isLeafVisible(entry, user?.role, plan, featureFlags)) return null;
    return { entry, children: null };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <nav aria-label="Main navigation" className={cn('flex flex-col gap-1', collapsed ? 'items-center px-2' : 'gap-0.5 px-2.5')}>
      <Accordion value={expanded} onValueChange={(value) => setExpanded(value as string[])} multiple className="contents">
        {entries.map(({ entry, children }, index) => (
          <div key={isGroup(entry) ? entry.label : entry.to} className={cn('w-full', collapsed && 'flex flex-col items-center')}>
            {index > 0 && <Separator className={cn('bg-sidebar-border', collapsed ? 'my-1 opacity-70' : 'my-1.5 opacity-70')} />}
            {children ? (
              <ModuleGroup
                group={entry as NavGroup}
                children={children}
                collapsed={collapsed}
                onNavigate={onNavigate}
                onGroupIconClick={handleGroupIconClick}
              />
            ) : (
              <TopLevelLink leaf={entry as NavLeaf} collapsed={collapsed} onNavigate={onNavigate} />
            )}
          </div>
        ))}
      </Accordion>
    </nav>
  );
}
