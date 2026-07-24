import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  UserCircle,
  Receipt,
  Tags,
  Users,
  BarChart3,
  Boxes,
  History,
  ClipboardList,
  UploadCloud,
  Undo2,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import type { PlanId, UserRole } from '@/features/auth/api';
import { hasFeature, type PlanFeatures } from '@/features/plans/lib/planConfig';

export interface NavLeaf {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  feature?: keyof PlanFeatures;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
}

export type NavEntry = NavLeaf | NavGroup;

export function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

export const NAV_ENTRIES: NavEntry[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, roles: ['owner', 'manager'] },
  {
    label: 'Sales',
    icon: ShoppingCart,
    children: [
      { to: '/pos', label: 'Billing / POS', icon: ShoppingCart, roles: ['owner', 'manager', 'staff'] },
      { to: '/invoices', label: 'Invoices', icon: Receipt, roles: ['owner', 'manager', 'staff'] },
      { to: '/returns', label: 'Returns', icon: Undo2, roles: ['owner', 'manager', 'staff'] },
    ],
  },
  {
    label: 'Catalog',
    icon: Package,
    children: [
      { to: '/categories', label: 'Categories', icon: Tags, roles: ['owner', 'manager', 'staff'] },
      { to: '/products', label: 'Products', icon: Package, roles: ['owner', 'manager', 'staff'] },
    ],
  },
  {
    label: 'Inventory',
    icon: Boxes,
    children: [
      { to: '/inventory', label: 'Overview', icon: LayoutDashboard, roles: ['owner', 'manager', 'staff'] },
      { to: '/inventory/products', label: 'Inventory List', icon: Boxes, roles: ['owner', 'manager', 'staff'] },
      { to: '/inventory/history', label: 'Stock History', icon: History, roles: ['owner', 'manager', 'staff'] },
      { to: '/inventory/import', label: 'Import Inventory', icon: UploadCloud, roles: ['owner', 'manager'] },
      { to: '/inventory/import-history', label: 'Import History', icon: ClipboardList, roles: ['owner', 'manager'] },
    ],
  },
  { to: '/customers', label: 'Customers', icon: Users, roles: ['owner', 'manager', 'staff'] },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['owner', 'manager'], feature: 'advanced_analytics' },
  { to: '/activity-log', label: 'Activity Log', icon: ScrollText, roles: ['owner', 'manager'] },
  { to: '/settings', label: 'Settings', icon: UserCircle, roles: ['owner', 'manager', 'staff'] },
];

export function isLeafVisible(leaf: NavLeaf, role: UserRole | undefined, plan: PlanId | null): boolean {
  if (role && !leaf.roles.includes(role)) return false;
  if (leaf.feature && !hasFeature(plan, leaf.feature)) return false;
  return true;
}
