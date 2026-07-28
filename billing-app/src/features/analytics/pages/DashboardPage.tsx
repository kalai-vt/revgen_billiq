import { DashboardShell } from '@/features/analytics/components/DashboardShell';
import { OVERVIEW_PRESETS } from '@/lib/date-range';

export function DashboardPage() {
  return (
    <DashboardShell
      title="Overview"
      description="Your business performance at a glance."
      defaultPreset="this_month"
      advanced={false}
      variant="overview"
      presets={OVERVIEW_PRESETS}
    />
  );
}
