import { Loader2 } from 'lucide-react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import type { AdminRole } from '@/services/authApi';

interface ProtectedRouteProps {
  roles?: AdminRole[];
}

export function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, adminUser } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && adminUser && !roles.includes(adminUser.role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg font-semibold">Access restricted</p>
        <p className="text-sm text-muted-foreground">Your role does not have permission to view this page.</p>
      </div>
    );
  }

  return <Outlet />;
}
