import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { hasFeature } from '@/features/plans/lib/planConfig';
import { useFeatureFlags } from '@/features/settings/hooks/useFeatureFlags';
import { DashboardShell } from '@/features/analytics/components/DashboardShell';

export function AnalyticsPage() {
  const { plan } = useAuth();
  const { data: featureFlags } = useFeatureFlags();
  // The Admin Portal can grant "Advanced Analytics" per-tenant regardless of plan — that
  // resolved override (if present) wins over the static plan check, same as the sidebar's gate.
  const canUseAdvanced = featureFlags?.advanced_analytics ?? hasFeature(plan, 'advanced_analytics');

  if (!canUseAdvanced) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Advanced Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Date-range reporting is available on the Explore plan and above. Your Overview still shows today's
          snapshot.
        </p>
        <Button nativeButton={false} render={<Link to="/pricing">View plans</Link>} />
      </div>
    );
  }

  return <DashboardShell title="Analytics" description="Sales performance at a glance." defaultPreset="last_7_days" advanced={canUseAdvanced} />;
}
