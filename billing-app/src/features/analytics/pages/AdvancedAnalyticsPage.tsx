import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { hasFeature } from '@/features/plans/lib/planConfig';
import { useFeatureFlags } from '@/features/settings/hooks/useFeatureFlags';
import { DashboardShell } from '@/features/analytics/components/DashboardShell';

export function AdvancedAnalyticsPage() {
  const { plan } = useAuth();
  const { data: featureFlags } = useFeatureFlags();
  // The Admin Portal can grant "Advanced Analytics" per-tenant regardless of plan — that
  // resolved (and cascaded through its "Analytics" parent module) override, if present, wins
  // over the static plan check, same as the sidebar's gate.
  const canUseAdvanced = featureFlags?.advanced_analytics ?? hasFeature(plan, 'advanced_analytics');

  if (!canUseAdvanced) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Advanced Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Detailed, date-range business intelligence is available on the Explore plan and above. Your Overview
          still shows this month's snapshot.
        </p>
        <Button nativeButton={false} render={<Link to="/pricing">View plans</Link>} />
      </div>
    );
  }

  return (
    <DashboardShell
      title="Advanced Analytics"
      description="Detailed business intelligence and performance reporting."
      defaultPreset="last_7_days"
      advanced={canUseAdvanced}
      variant="advanced"
    />
  );
}
