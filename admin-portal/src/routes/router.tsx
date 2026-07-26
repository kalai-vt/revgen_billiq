import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminShell } from '@/components/layout/AdminShell';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { ComingSoonPage } from '@/pages/ComingSoonPage';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const CustomersPage = lazy(() => import('@/pages/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const CustomerProfilePage = lazy(() =>
  import('@/pages/customers/CustomerProfilePage').then((m) => ({ default: m.CustomerProfilePage })),
);
const FeatureManagementPage = lazy(() =>
  import('@/pages/features/FeatureManagementPage').then((m) => ({ default: m.FeatureManagementPage })),
);

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AdminShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/customers', element: <CustomersPage /> },
          { path: '/customers/:tenantId', element: <CustomerProfilePage /> },
          { path: '/customers/:tenantId/features', element: <FeatureManagementPage /> },
          { path: '/features', element: <ComingSoonPage title="Feature Management" /> },
          { path: '/subscriptions', element: <ComingSoonPage title="Subscriptions" /> },
          { path: '/payments', element: <ComingSoonPage title="Payments" /> },
          { path: '/usage-analytics', element: <ComingSoonPage title="Usage Analytics" /> },
          { path: '/communications', element: <ComingSoonPage title="Communications" /> },
          { path: '/support', element: <ComingSoonPage title="Support" /> },
          { path: '/reports', element: <ComingSoonPage title="Reports" /> },
          { path: '/notifications', element: <ComingSoonPage title="Notifications" /> },
          { path: '/audit-logs', element: <ComingSoonPage title="Audit Logs" /> },
          { path: '/system-monitoring', element: <ComingSoonPage title="System Monitoring" /> },
          { path: '/settings', element: <ComingSoonPage title="Settings" /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
