import { Fragment } from 'react';
import { ChevronRight, Home, ShoppingCart } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useBreadcrumbAction } from '@/components/layout/pageActions';
import { getRoleHomeRoute } from '@/lib/roleHome';

interface RouteMeta {
  label: string;
  group?: string;
}

const ROUTE_LABELS: Record<string, RouteMeta> = {
  '/dashboard': { label: 'Overview' },
  '/analytics/advanced': { label: 'Advanced Analytics', group: 'Analytics' },
  '/analytics/trends': { label: 'Trend Comparison', group: 'Analytics' },
  '/pos': { label: 'Billing', group: 'Sales' },
  '/invoices': { label: 'Invoices', group: 'Sales' },
  '/returns': { label: 'Returns & Refunds', group: 'Sales' },
  '/outstanding': { label: 'Outstanding', group: 'Sales' },
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
  '/procurement/dashboard': { label: 'Dashboard', group: 'Procurement' },
  '/procurement/vendors': { label: 'Vendors', group: 'Procurement' },
  '/procurement/purchases': { label: 'Purchase Entry', group: 'Procurement' },
  '/procurement/returns': { label: 'Purchase Returns', group: 'Procurement' },
  '/procurement/vendor-payments': { label: 'Vendor Payments', group: 'Procurement' },
  '/procurement/analytics': { label: 'Procurement Analytics', group: 'Procurement' },
  '/procurement/reports': { label: 'Procurement Reports', group: 'Procurement' },
  '/commerce/dashboard': { label: 'Dashboard', group: 'Commerce' },
  '/commerce/swiggy': { label: 'Swiggy', group: 'Commerce' },
  '/commerce/zomato': { label: 'Zomato', group: 'Commerce' },
  '/commerce/orders': { label: 'Orders', group: 'Commerce' },
  '/commerce/product-mapping': { label: 'Product Mapping', group: 'Commerce' },
  '/activity-log': { label: 'Activity Log' },
  '/settings': { label: 'Settings' },
};

/** Default header action on every page that doesn't register its own via PageHeaderAction — a
 * one-click shortcut into Billing so starting a sale never requires the sidebar. The Billing page
 * itself overrides this slot with "Held Bills" (see POSPage.tsx), which is why this isn't shown
 * there. */
function NewSaleAction() {
  const navigate = useNavigate();
  return (
    <Button
      size="sm"
      className="gap-1.5"
      onClick={() => navigate('/pos')}
    >
      <ShoppingCart className="size-4" />
      New Sale
    </Button>
  );
}

export function Breadcrumbs() {
  const location = useLocation();
  const { user } = useAuth();
  const action = useBreadcrumbAction();
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
      <div className="ml-auto flex items-center">{action ?? <NewSaleAction />}</div>
    </nav>
  );
}
