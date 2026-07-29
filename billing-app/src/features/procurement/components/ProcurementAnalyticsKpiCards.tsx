import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProcurementAnalyticsKpis } from '@/features/procurement/api';

interface KpiTileConfig {
  key: keyof ProcurementAnalyticsKpis;
  label: string;
  format: 'currency' | 'number' | 'percent';
}

const KPI_TILES: KpiTileConfig[] = [
  { key: 'total_purchase_value', label: 'Total Purchase Value', format: 'currency' },
  { key: 'total_purchase_count', label: 'Total Purchases', format: 'number' },
  { key: 'total_return_value', label: 'Total Returns Value', format: 'currency' },
  { key: 'inventory_value', label: 'Inventory Value', format: 'currency' },
  { key: 'gross_profit', label: 'Gross Profit (approx.)', format: 'currency' },
  { key: 'gross_margin_percent', label: 'Gross Margin %', format: 'percent' },
];

function formatValue(value: number, format: KpiTileConfig['format']): string {
  if (format === 'currency') return `₹${value.toFixed(2)}`;
  if (format === 'percent') return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

interface ProcurementAnalyticsKpiCardsProps {
  kpis: ProcurementAnalyticsKpis | undefined;
  isLoading: boolean;
}

export function ProcurementAnalyticsKpiCards({ kpis, isLoading }: ProcurementAnalyticsKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {KPI_TILES.map((tile) => (
        <Card key={tile.key} size="sm">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs font-medium text-muted-foreground">{tile.label}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !kpis ? <Skeleton className="h-6 w-16" /> : <p className="text-lg font-semibold tracking-tight">{formatValue(kpis[tile.key], tile.format)}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
