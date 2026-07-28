import { Card, CardContent } from '@shared/components/ui/card';
import { Skeleton } from '@shared/components/ui/skeleton';
import type { TenantFeatureSummary } from '@/services/featuresApi';

interface TenantKpiCardsProps {
  data: TenantFeatureSummary | undefined;
  isLoading: boolean;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function TenantKpiCards({ data, isLoading }: TenantKpiCardsProps) {
  const cards = [
    { label: 'Total Modules', value: data?.total_modules },
    { label: 'Enabled', value: data?.enabled_count },
    { label: 'Disabled', value: data?.disabled_count },
    { label: 'Custom Features', value: data?.custom_count },
    { label: 'Default Features', value: data?.default_count },
    { label: 'Last Updated', value: formatDate(data?.last_updated) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="space-y-1 p-3">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            {isLoading || data === undefined ? (
              <Skeleton className="h-6 w-12" />
            ) : (
              <p className="text-xl font-semibold tabular-nums">{card.value}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
