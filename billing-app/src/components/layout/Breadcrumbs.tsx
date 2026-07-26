import { Fragment } from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getRoleHomeRoute } from '@/lib/roleHome';

interface RouteMeta {
  label: string;
  group?: string;
}

const ROUTE_LABELS: Record<string, RouteMeta> = {
  '/dashboard': { label: 'Overview' },
  '/analytics': { label: 'Analytics' },
  '/pos': { label: 'Billing / POS', group: 'Sales' },
  '/invoices': { label: 'Invoices', group: 'Sales' },
  '/returns': { label: 'Returns', group: 'Sales' },
  '/categories': { label: 'Categories', group: 'Catalog' },
  '/products': { label: 'Products', group: 'Catalog' },
  '/products/import': { label: 'Import Products', group: 'Catalog' },
  '/products/import-history': { label: 'Import History', group: 'Catalog' },
  '/inventory': { label: 'Overview', group: 'Inventory' },
  '/inventory/products': { label: 'Inventory List', group: 'Inventory' },
  '/inventory/history': { label: 'Stock History', group: 'Inventory' },
  '/inventory/import': { label: 'Import Inventory', group: 'Inventory' },
  '/inventory/import-history': { label: 'Import History', group: 'Inventory' },
  '/customers': { label: 'Customers' },
  '/customers/import': { label: 'Import Customers', group: 'Customers' },
  '/customers/import-history': { label: 'Import History', group: 'Customers' },
  '/activity-log': { label: 'Activity Log' },
  '/settings': { label: 'Settings' },
};

export function Breadcrumbs() {
  const location = useLocation();
  const { user } = useAuth();
  const meta = ROUTE_LABELS[location.pathname];

  if (!meta) return null;

  const homeRoute = getRoleHomeRoute(user?.role);
  const crumbs = [
    { label: 'Home', to: homeRoute },
    ...(meta.group ? [{ label: meta.group, to: null }] : []),
    { label: meta.label, to: null },
  ];

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex shrink-0 items-center gap-1.5 border-b bg-background px-4 py-2 text-sm text-muted-foreground md:px-6"
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <Fragment key={`${crumb.label}-${index}`}>
            {index > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />}
            {crumb.to && !isLast ? (
              <Link to={crumb.to} className="flex items-center gap-1 hover:text-foreground">
                {index === 0 && <Home className="size-3.5" />}
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-medium text-foreground' : ''}>{crumb.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
