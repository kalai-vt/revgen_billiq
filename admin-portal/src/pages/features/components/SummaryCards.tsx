import { Card, CardContent } from '@shared/components/ui/card';
import { Skeleton } from '@shared/components/ui/skeleton';
import type { FeatureSummary } from '@/services/featuresApi';

interface SummaryCardsProps {
  data: FeatureSummary | undefined;
  isLoading: boolean;
}

export function SummaryCards({ data, isLoading }: SummaryCardsProps) {
  const cards = [
    { label: 'Total customers', value: data?.total_customers },
    { label: 'Active customers', value: data?.active_customers },
    { label: 'Custom feature sets', value: data?.customers_with_custom_features },
    { label: 'On default configuration', value: data?.default_configuration_customers },
    { label: 'Modules enabled today', value: data?.modules_enabled_today },
    { label: 'Modules disabled today', value: data?.modules_disabled_today },
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
