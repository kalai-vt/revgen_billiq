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
  Wallet,
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
  /** Module key the RevGenIQ Admin Portal can toggle off per-tenant (Feature Management).
   * Absent means the leaf is always visible regardless of admin-controlled flags. */
  moduleKey?: string;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
}

type NavEntry = NavLeaf | NavGroup;

export function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

export const NAV_ENTRIES: NavEntry[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, roles: ['owner', 'manager'] },
  {
    label: 'Sales',
    icon: ShoppingCart,
    children: [
      { to: '/pos', label: 'Billing / POS', icon: ShoppingCart, roles: ['owner', 'manager', 'staff'], moduleKey: 'pos_billing' },
      { to: '/invoices', label: 'Invoices', icon: Receipt, roles: ['owner', 'manager', 'staff'], moduleKey: 'pos_billing' },
      { to: '/returns', label: 'Returns', icon: Undo2, roles: ['owner', 'manager', 'staff'], moduleKey: 'returns' },
      { to: '/outstanding', label: 'Outstanding', icon: Wallet, roles: ['owner', 'manager'], moduleKey: 'payments_credit' },
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
      { to: '/inventory', label: 'Overview', icon: LayoutDashboard, roles: ['owner', 'manager', 'staff'], moduleKey: 'inventory' },
      { to: '/inventory/products', label: 'Inventory List', icon: Boxes, roles: ['owner', 'manager', 'staff'], moduleKey: 'inventory' },
      { to: '/inventory/history', label: 'Stock History', icon: History, roles: ['owner', 'manager', 'staff'], moduleKey: 'inventory' },
      { to: '/inventory/import', label: 'Import Inventory', icon: UploadCloud, roles: ['owner', 'manager'], moduleKey: 'inventory' },
      { to: '/inventory/import-history', label: 'Import History', icon: ClipboardList, roles: ['owner', 'manager'], moduleKey: 'inventory' },
    ],
  },
  { to: '/customers', label: 'Customers', icon: Users, roles: ['owner', 'manager', 'staff'], moduleKey: 'customers' },
  {
    to: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
    roles: ['owner', 'manager'],
    feature: 'advanced_analytics',
    moduleKey: 'reports_analytics',
  },
  { to: '/activity-log', label: 'Activity Log', icon: ScrollText, roles: ['owner', 'manager'] },
  { to: '/settings', label: 'Settings', icon: UserCircle, roles: ['owner', 'manager', 'staff'] },
];

export function isLeafVisible(
  leaf: NavLeaf,
  role: UserRole | undefined,
  plan: PlanId | null,
  featureFlags?: Record<string, boolean>,
): boolean {
  if (role && !leaf.roles.includes(role)) return false;
  if (leaf.feature && !hasFeature(plan, leaf.feature)) return false;
  if (leaf.moduleKey && featureFlags?.[leaf.moduleKey] === false) return false;
  return true;
}
