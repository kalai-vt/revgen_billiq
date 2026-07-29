import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CommerceDashboardKpis } from '@/features/commerce/api';

interface KpiTileConfig {
  key: keyof CommerceDashboardKpis;
  label: string;
  format: 'currency' | 'number';
}

const KPI_TILES: KpiTileConfig[] = [
  { key: 'total_online_orders', label: 'Total Online Orders', format: 'number' },
  { key: 'swiggy_orders', label: 'Swiggy Orders', format: 'number' },
  { key: 'zomato_orders', label: 'Zomato Orders', format: 'number' },
  { key: 'total_online_revenue', label: 'Total Online Revenue', format: 'currency' },
  { key: 'average_order_value', label: 'Average Order Value', format: 'currency' },
  { key: 'cancelled_orders', label: 'Cancelled Orders', format: 'number' },
];

function formatValue(value: number, format: 'currency' | 'number'): string {
  return format === 'currency' ? `₹${value.toFixed(2)}` : value.toLocaleString();
}

interface CommerceKpiCardsProps {
  kpis: CommerceDashboardKpis | undefined;
  isLoading: boolean;
}

export function CommerceKpiCards({ kpis, isLoading }: CommerceKpiCardsProps) {
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
