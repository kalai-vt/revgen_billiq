import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { RequireModule } from '@/components/layout/RequireModule';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { APP_BASE_PATH } from '@/lib/app-path';
import { getRoleHomeRoute } from '@/lib/roleHome';

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const CheckEmailPage = lazy(() => import('@/features/auth/pages/CheckEmailPage').then((m) => ({ default: m.CheckEmailPage })));
const VerifyEmailPage = lazy(() => import('@/features/auth/pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })));
const ForgotPasswordPage = lazy(() =>
  import('@/features/auth/pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('@/features/auth/pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const SignedOutPage = lazy(() => import('@/features/auth/pages/SignedOutPage').then((m) => ({ default: m.SignedOutPage })));
const ActivityLogPage = lazy(() => import('@/features/activity/pages/ActivityLogPage').then((m) => ({ default: m.ActivityLogPage })));
const CategoriesPage = lazy(() => import('@/features/categories/pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage })));
const CustomersPage = lazy(() => import('@/features/customers/pages/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const CustomerDetailPage = lazy(() =>
  import('@/features/customers/pages/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })),
);
const ProductsPage = lazy(() => import('@/features/products/pages/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const InventoryDashboardPage = lazy(() =>
  import('@/features/inventory/pages/InventoryDashboardPage').then((m) => ({ default: m.InventoryDashboardPage })),
);
const InventoryListPage = lazy(() =>
  import('@/features/inventory/pages/InventoryListPage').then((m) => ({ default: m.InventoryListPage })),
);
const StockHistoryPage = lazy(() =>
  import('@/features/inventory/pages/StockHistoryPage').then((m) => ({ default: m.StockHistoryPage })),
);
const ImportInventoryPage = lazy(() =>
  import('@/features/inventory/pages/ImportInventoryPage').then((m) => ({ default: m.ImportInventoryPage })),
);
const InventoryImportHistoryPage = lazy(() =>
  import('@/features/inventory/pages/ImportHistoryPage').then((m) => ({ default: m.ImportHistoryPage })),
);
const ImportProductsPage = lazy(() =>
  import('@/features/products/pages/ImportProductsPage').then((m) => ({ default: m.ImportProductsPage })),
);
const ProductImportHistoryPage = lazy(() =>
  import('@/features/products/pages/ImportHistoryPage').then((m) => ({ default: m.ImportHistoryPage })),
);
const ImportCustomersPage = lazy(() =>
  import('@/features/customers/pages/ImportCustomersPage').then((m) => ({ default: m.ImportCustomersPage })),
);
const CustomerImportHistoryPage = lazy(() =>
  import('@/features/customers/pages/ImportHistoryPage').then((m) => ({ default: m.ImportHistoryPage })),
);
const POSPage = lazy(() => import('@/features/pos/pages/POSPage').then((m) => ({ default: m.POSPage })));
const InvoicesListPage = lazy(() => import('@/features/pos/pages/InvoicesListPage').then((m) => ({ default: m.InvoicesListPage })));
const ReturnHistoryPage = lazy(() => import('@/features/pos/pages/ReturnHistoryPage').then((m) => ({ default: m.ReturnHistoryPage })));
const OutstandingDashboardPage = lazy(() =>
  import('@/features/payments/pages/OutstandingDashboardPage').then((m) => ({ default: m.OutstandingDashboardPage })),
);
const InvoicePrintPage = lazy(() => import('@/features/pos/pages/InvoicePrintPage').then((m) => ({ default: m.InvoicePrintPage })));
const ReturnPrintPage = lazy(() => import('@/features/pos/pages/ReturnPrintPage').then((m) => ({ default: m.ReturnPrintPage })));
const DashboardPage = lazy(() => import('@/features/analytics/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const AdvancedAnalyticsPage = lazy(() =>
  import('@/features/analytics/pages/AdvancedAnalyticsPage').then((m) => ({ default: m.AdvancedAnalyticsPage })),
);
const TrendComparisonPage = lazy(() =>
  import('@/features/analytics/pages/TrendComparisonPage').then((m) => ({ default: m.TrendComparisonPage })),
);
const PricingPage = lazy(() => import('@/features/plans/pages/PricingPage').then((m) => ({ default: m.PricingPage })));
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const InvoiceDesignerPage = lazy(() =>
  import('@/features/invoice-designer/pages/InvoiceDesignerPage').then((m) => ({ default: m.InvoiceDesignerPage })),
);

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={getRoleHomeRoute(user?.role)} replace />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/check-email', element: <CheckEmailPage /> },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/signed-out', element: <SignedOutPage /> },
  { path: '/pricing', element: <PricingPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/invoices/:id/print', element: <InvoicePrintPage /> },
      { path: '/returns/:id/print', element: <ReturnPrintPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomeRedirect /> },
          {
            element: <ProtectedRoute roles={['owner', 'manager']} />,
            children: [
              {
                path: '/dashboard',
                element: (
                  <RequireModule moduleKey="reports_analytics" label="Dashboard">
                    <DashboardPage />
                  </RequireModule>
                ),
              },
              { path: '/analytics', element: <Navigate to="/analytics/advanced" replace /> },
              { path: '/analytics/advanced', element: <AdvancedAnalyticsPage /> },
              { path: '/analytics/trends', element: <TrendComparisonPage /> },
              {
                path: '/outstanding',
                element: (
                  <RequireModule moduleKey="payments_credit" label="Outstanding">
                    <OutstandingDashboardPage />
                  </RequireModule>
                ),
              },
              {
                path: '/inventory/import',
                element: (
                  <RequireModule moduleKey="inventory" label="Inventory">
                    <ImportInventoryPage />
                  </RequireModule>
                ),
              },
              {
                path: '/inventory/import-history',
                element: (
                  <RequireModule moduleKey="inventory" label="Inventory">
                    <InventoryImportHistoryPage />
                  </RequireModule>
                ),
              },
              {
                path: '/products/import',
                element: (
                  <RequireModule moduleKey="products" label="Products">
                    <ImportProductsPage />
                  </RequireModule>
                ),
              },
              {
                path: '/products/import-history',
                element: (
                  <RequireModule moduleKey="products" label="Products">
                    <ProductImportHistoryPage />
                  </RequireModule>
                ),
              },
              {
                path: '/customers/import',
                element: (
                  <RequireModule moduleKey="customers" label="Customers">
                    <ImportCustomersPage />
                  </RequireModule>
                ),
              },
              {
                path: '/customers/import-history',
                element: (
                  <RequireModule moduleKey="customers" label="Customers">
                    <CustomerImportHistoryPage />
                  </RequireModule>
                ),
              },
              { path: '/activity-log', element: <ActivityLogPage /> },
            ],
          },
          {
            path: '/products',
            element: (
              <RequireModule moduleKey="products" label="Products">
                <ProductsPage />
              </RequireModule>
            ),
          },
          {
            path: '/categories',
            element: (
              <RequireModule moduleKey="categories" label="Categories">
                <CategoriesPage />
              </RequireModule>
            ),
          },
          {
            path: '/inventory',
            element: (
              <RequireModule moduleKey="inventory" label="Inventory">
                <InventoryDashboardPage />
              </RequireModule>
            ),
          },
          {
            path: '/inventory/products',
            element: (
              <RequireModule moduleKey="inventory" label="Inventory">
                <InventoryListPage />
              </RequireModule>
            ),
          },
          {
            path: '/inventory/history',
            element: (
              <RequireModule moduleKey="inventory" label="Inventory">
                <StockHistoryPage />
              </RequireModule>
            ),
          },
          {
            path: '/customers',
            element: (
              <RequireModule moduleKey="customers" label="Customers">
                <CustomersPage />
              </RequireModule>
            ),
          },
          {
            path: '/customers/:id',
            element: (
              <RequireModule moduleKey="customers" label="Customers">
                <CustomerDetailPage />
              </RequireModule>
            ),
          },
          {
            path: '/pos',
            element: (
              <RequireModule moduleKey="pos_billing" label="Billing">
                <POSPage />
              </RequireModule>
            ),
          },
          {
            path: '/invoices',
            element: (
              <RequireModule moduleKey="pos_billing" label="Invoices">
                <InvoicesListPage />
              </RequireModule>
            ),
          },
          {
            path: '/returns',
            element: (
              <RequireModule moduleKey="returns" label="Returns & Refunds">
                <ReturnHistoryPage />
              </RequireModule>
            ),
          },
          { path: '/settings', element: <SettingsPage /> },
          {
            element: <ProtectedRoute roles={['owner']} />,
            children: [
              {
                path: '/settings/invoice-designer',
                element: (
                  <RequireModule moduleKey="invoice_designer" label="Invoice Designer">
                    <InvoiceDesignerPage />
                  </RequireModule>
                ),
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
], { basename: APP_BASE_PATH || '/' });
