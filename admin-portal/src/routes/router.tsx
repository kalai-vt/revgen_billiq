import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminShell } from '@/components/layout/AdminShell';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const AcceptInvitePage = lazy(() => import('@/pages/auth/AcceptInvitePage').then((m) => ({ default: m.AcceptInvitePage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const CustomersPage = lazy(() => import('@/pages/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const CustomerProfilePage = lazy(() =>
  import('@/pages/customers/CustomerProfilePage').then((m) => ({ default: m.CustomerProfilePage })),
);
const FeatureManagementPage = lazy(() =>
  import('@/pages/features/FeatureManagementPage').then((m) => ({ default: m.FeatureManagementPage })),
);
const SubscriptionsPage = lazy(() => import('@/pages/subscriptions/SubscriptionsPage').then((m) => ({ default: m.SubscriptionsPage })));
const PaymentsPage = lazy(() => import('@/pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const UsageAnalyticsPage = lazy(() => import('@/pages/UsageAnalyticsPage').then((m) => ({ default: m.UsageAnalyticsPage })));
const CommunicationsPage = lazy(() => import('@/pages/CommunicationsPage').then((m) => ({ default: m.CommunicationsPage })));
const SupportPage = lazy(() => import('@/pages/support/SupportPage').then((m) => ({ default: m.SupportPage })));
const SupportTicketDetailPage = lazy(() =>
  import('@/pages/support/SupportTicketDetailPage').then((m) => ({ default: m.SupportTicketDetailPage })),
);
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const AuditLogsPage = lazy(() => import('@/pages/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })));
const SystemMonitoringPage = lazy(() => import('@/pages/SystemMonitoringPage').then((m) => ({ default: m.SystemMonitoringPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/accept-invite', element: <AcceptInvitePage /> },
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
          { path: '/subscriptions', element: <SubscriptionsPage /> },
          { path: '/payments', element: <PaymentsPage /> },
          { path: '/usage-analytics', element: <UsageAnalyticsPage /> },
          { path: '/communications', element: <CommunicationsPage /> },
          { path: '/support', element: <SupportPage /> },
          { path: '/support/:ticketId', element: <SupportTicketDetailPage /> },
          { path: '/reports', element: <ReportsPage /> },
          { path: '/notifications', element: <NotificationsPage /> },
          { path: '/audit-logs', element: <AuditLogsPage /> },
          { path: '/system-monitoring', element: <SystemMonitoringPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
