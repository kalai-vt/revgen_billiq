import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/hooks/useAuth';
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
          isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
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
            ? cn(COLLAPSED_ICON_BOX, isActive ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-muted/70 hover:text-foreground')
            : cn(
                'flex items-center gap-2.5 rounded-md border-l-[3px] px-2.5 py-2',
                isActive
                  ? 'border-primary bg-primary/10 font-semibold text-primary'
                  : 'border-transparent text-foreground/80 hover:bg-muted/70 hover:text-foreground',
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
        className={cn(COLLAPSED_ICON_BOX, 'text-foreground/80 transition-colors hover:bg-muted/70 hover:text-foreground')}
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
      <AccordionTrigger className="w-full rounded-md px-2.5 py-2 text-foreground/80 hover:bg-muted/70">
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

  const entries = NAV_ENTRIES.map((entry) => {
    if (isGroup(entry)) {
      const children = entry.children.filter((leaf) => isLeafVisible(leaf, user?.role, plan));
      if (children.length === 0) return null;
      return { entry, children };
    }
    if (!isLeafVisible(entry, user?.role, plan)) return null;
    return { entry, children: null };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <nav aria-label="Main navigation" className={cn('flex flex-col gap-1', collapsed ? 'items-center px-2' : 'gap-0.5 px-2.5')}>
      <Accordion value={expanded} onValueChange={(value) => setExpanded(value as string[])} multiple className="contents">
        {entries.map(({ entry, children }, index) => (
          <div key={isGroup(entry) ? entry.label : entry.to} className={cn('w-full', collapsed && 'flex flex-col items-center')}>
            {index > 0 && <Separator className={collapsed ? 'my-1 opacity-70' : 'my-1.5 opacity-70'} />}
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
