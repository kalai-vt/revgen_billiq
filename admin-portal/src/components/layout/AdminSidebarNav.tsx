import { NavLink } from 'react-router-dom';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Customers', to: '/customers', icon: Users },
  { label: 'Subscriptions', to: '/subscriptions', icon: CreditCard },
  { label: 'Payments', to: '/payments', icon: Receipt },
  { label: 'Feature Management', to: '/features', icon: ToggleLeft },
  { label: 'Usage Analytics', to: '/usage-analytics', icon: BarChart3 },
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

export function AdminSidebarNav({ onNavigate }: AdminSidebarNavProps) {
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-muted',
            )
          }
        >
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
