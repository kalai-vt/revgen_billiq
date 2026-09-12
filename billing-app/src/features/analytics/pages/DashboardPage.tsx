import { DashboardShell } from '@/features/analytics/components/DashboardShell';
import { OVERVIEW_PRESETS } from '@/lib/date-range';

export function DashboardPage() {
  return (
    <DashboardShell
      title="Overview"
      description="Your business performance at a glance."
      // Opens on today: the Overview is the screen a shop owner checks during service to see
      // how the day is going, not a month-to-date report. A longer window is one click away.
      defaultPreset="today"
      advanced={false}
      variant="overview"
      presets={OVERVIEW_PRESETS}
    />
  );
}
