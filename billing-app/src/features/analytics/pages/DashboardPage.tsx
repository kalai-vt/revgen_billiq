import { DashboardShell } from '@/features/analytics/components/DashboardShell';

export function DashboardPage() {
  return <DashboardShell title="Overview" description="Today's snapshot at a glance." defaultPreset="today" advanced={false} />;
}
