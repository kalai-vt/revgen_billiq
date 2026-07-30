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
const PrivacyPolicyPage = lazy(() =>
  import('@/features/legal/pages/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage })),
);
const TermsOfServicePage = lazy(() =>
  import('@/features/legal/pages/TermsOfServicePage').then((m) => ({ default: m.TermsOfServicePage })),
);
const CookiePolicyPage = lazy(() =>
  import('@/features/legal/pages/CookiePolicyPage').then((m) => ({ default: m.CookiePolicyPage })),
);
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const VendorsPage = lazy(() => import('@/features/procurement/pages/VendorsPage').then((m) => ({ default: m.VendorsPage })));
const PurchaseEntriesPage = lazy(() =>
  import('@/features/procurement/pages/PurchaseEntriesPage').then((m) => ({ default: m.PurchaseEntriesPage })),
);
const PurchaseEntryDetailPage = lazy(() =>
  import('@/features/procurement/pages/PurchaseEntryDetailPage').then((m) => ({ default: m.PurchaseEntryDetailPage })),
);
const ProcurementDashboardPage = lazy(() =>
  import('@/features/procurement/pages/ProcurementDashboardPage').then((m) => ({ default: m.ProcurementDashboardPage })),
);
const PurchaseReturnsPage = lazy(() =>
  import('@/features/procurement/pages/PurchaseReturnsPage').then((m) => ({ default: m.PurchaseReturnsPage })),
);
const VendorPaymentsPage = lazy(() =>
  import('@/features/procurement/pages/VendorPaymentsPage').then((m) => ({ default: m.VendorPaymentsPage })),
);
const VendorLedgerPage = lazy(() =>
  import('@/features/procurement/pages/VendorLedgerPage').then((m) => ({ default: m.VendorLedgerPage })),
);
const ProcurementAnalyticsPage = lazy(() =>
  import('@/features/procurement/pages/ProcurementAnalyticsPage').then((m) => ({ default: m.ProcurementAnalyticsPage })),
);
const ProcurementReportsPage = lazy(() =>
  import('@/features/procurement/pages/ProcurementReportsPage').then((m) => ({ default: m.ProcurementReportsPage })),
);
const CommerceDashboardPage = lazy(() =>
  import('@/features/commerce/pages/CommerceDashboardPage').then((m) => ({ default: m.CommerceDashboardPage })),
);
const CommerceIntegrationPage = lazy(() =>
  import('@/features/commerce/pages/CommerceIntegrationPage').then((m) => ({ default: m.CommerceIntegrationPage })),
);
const CommerceOrdersPage = lazy(() => import('@/features/commerce/pages/CommerceOrdersPage').then((m) => ({ default: m.CommerceOrdersPage })));
const CommerceOrderDetailPage = lazy(() =>
  import('@/features/commerce/pages/CommerceOrderDetailPage').then((m) => ({ default: m.CommerceOrderDetailPage })),
);
const ProductMappingPage = lazy(() =>
  import('@/features/commerce/pages/ProductMappingPage').then((m) => ({ default: m.ProductMappingPage })),
);
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
  { path: '/privacy', element: <PrivacyPolicyPage /> },
  { path: '/terms', element: <TermsOfServicePage /> },
  { path: '/cookies', element: <CookiePolicyPage /> },
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
                  <RequireModule moduleKey="reports_analytics" label="Overview">
                    <DashboardPage />
                  </RequireModule>
                ),
              },
              {
                path: '/procurement/dashboard',
                element: (
                  <RequireModule moduleKey="procurement" label="Procurement">
                    <ProcurementDashboardPage />
                  </RequireModule>
                ),
              },
              {
                path: '/procurement/analytics',
                element: (
                  <RequireModule moduleKey="procurement_analytics" label="Procurement Analytics">
                    <ProcurementAnalyticsPage />
                  </RequireModule>
                ),
              },
              {
                path: '/procurement/reports',
                element: (
                  <RequireModule moduleKey="procurement_reports" label="Procurement Reports">
                    <ProcurementReportsPage />
                  </RequireModule>
                ),
              },
              {
                path: '/commerce/dashboard',
                element: (
                  <RequireModule moduleKey="commerce_analytics" label="Commerce Dashboard">
                    <CommerceDashboardPage />
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
            path: '/procurement/vendors',
            element: (
              <RequireModule moduleKey="vendors" label="Vendors">
                <VendorsPage />
              </RequireModule>
            ),
          },
          {
            path: '/procurement/purchases',
            element: (
              <RequireModule moduleKey="purchase_entries" label="Purchase Entry">
                <PurchaseEntriesPage />
              </RequireModule>
            ),
          },
          {
            path: '/procurement/purchases/:id',
            element: (
              <RequireModule moduleKey="purchase_entries" label="Purchase Entry">
                <PurchaseEntryDetailPage />
              </RequireModule>
            ),
          },
          {
            path: '/procurement/returns',
            element: (
              <RequireModule moduleKey="purchase_returns" label="Purchase Returns">
                <PurchaseReturnsPage />
              </RequireModule>
            ),
          },
          {
            path: '/procurement/vendor-payments',
            element: (
              <RequireModule moduleKey="vendor_payments" label="Vendor Payments">
                <VendorPaymentsPage />
              </RequireModule>
            ),
          },
          {
            path: '/procurement/vendors/:id/ledger',
            element: (
              <RequireModule moduleKey="vendor_payments" label="Vendor Payments">
                <VendorLedgerPage />
              </RequireModule>
            ),
          },
          {
            path: '/commerce/swiggy',
            element: (
              <RequireModule moduleKey="commerce_swiggy" label="Swiggy">
                <CommerceIntegrationPage platform="swiggy" />
              </RequireModule>
            ),
          },
          {
            path: '/commerce/zomato',
            element: (
              <RequireModule moduleKey="commerce_zomato" label="Zomato">
                <CommerceIntegrationPage platform="zomato" />
              </RequireModule>
            ),
          },
          {
            path: '/commerce/orders',
            element: (
              <RequireModule moduleKey="commerce" label="Commerce">
                <CommerceOrdersPage />
              </RequireModule>
            ),
          },
          {
            path: '/commerce/orders/:id',
            element: (
              <RequireModule moduleKey="commerce" label="Commerce">
                <CommerceOrderDetailPage />
              </RequireModule>
            ),
          },
          {
            path: '/commerce/product-mapping',
            element: (
              <RequireModule moduleKey="commerce" label="Commerce">
                <ProductMappingPage />
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
