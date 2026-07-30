import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Receipt,
  ToggleLeft,
  BarChart3,
  MessageSquare,
  LifeBuoy,
  FileBarChart,
  Bell,
  ScrollText,
  Activity,
  Settings,
  ShieldCheck,
  Building2,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavLeaf {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
}

interface NavGroup {
  label: string;
  icon: typeof LayoutDashboard;
  children: NavEntry[];
}

type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

const NAV_ENTRIES: NavEntry[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Customers', to: '/customers', icon: Users },
  {
    label: 'Administration',
    icon: ShieldCheck,
    children: [
      {
        label: 'Tenant Management',
        icon: Building2,
        children: [
          { label: 'Subscription Plans', to: '/subscriptions', icon: CreditCard },
          { label: 'Usage Management', to: '/usage-analytics', icon: BarChart3 },
          { label: 'Feature Management', to: '/features', icon: ToggleLeft },
        ],
      },
    ],
  },
  { label: 'Payments', to: '/payments', icon: Receipt },
  { label: 'Communications', to: '/communications', icon: MessageSquare },
  { label: 'Support', to: '/support', icon: LifeBuoy },
  { label: 'Reports', to: '/reports', icon: FileBarChart },
  { label: 'Notifications', to: '/notifications', icon: Bell },
  { label: 'Audit Logs', to: '/audit-logs', icon: ScrollText },
  { label: 'System Monitoring', to: '/system-monitoring', icon: Activity },
  { label: 'Settings', to: '/settings', icon: Settings },
];

interface AdminSidebarNavProps {
  onNavigate?: () => void;
}

function GroupItem({ group, depth, onNavigate, activePath }: { group: NavGroup; depth: number; onNavigate?: () => void; activePath: string }) {
  const [expanded, setExpanded] = useState<boolean>(true);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted',
          depth > 0 && 'text-xs text-muted-foreground',
        )}
      >
        <group.icon className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className={cn('flex flex-col gap-0.5', depth === 0 ? 'ml-3 border-l pl-2' : 'ml-2')}>
          {group.children.map((child) => (
            <NavEntryItem key={isGroup(child) ? child.label : child.to} entry={child} depth={depth + 1} onNavigate={onNavigate} activePath={activePath} />
          ))}
        </div>
      )}
    </div>
  );
}

function NavEntryItem({ entry, depth, onNavigate, activePath }: { entry: NavEntry; depth: number; onNavigate?: () => void; activePath: string }) {
  if (isGroup(entry)) {
    return <GroupItem group={entry} depth={depth} onNavigate={onNavigate} activePath={activePath} />;
  }
  return (
    <NavLink
      to={entry.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-muted',
        )
      }
    >
      <entry.icon className="size-4 shrink-0" />
      <span className="truncate">{entry.label}</span>
    </NavLink>
  );
}

export function AdminSidebarNav({ onNavigate }: AdminSidebarNavProps) {
  const location = useLocation();
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {NAV_ENTRIES.map((entry) => (
        <NavEntryItem key={isGroup(entry) ? entry.label : entry.to} entry={entry} depth={0} onNavigate={onNavigate} activePath={location.pathname} />
      ))}
    </nav>
  );
}
