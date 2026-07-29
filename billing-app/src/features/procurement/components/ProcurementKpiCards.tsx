import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProcurementDashboardKpis } from '@/features/procurement/api';

interface KpiTileConfig {
  key: keyof ProcurementDashboardKpis;
  label: string;
  format: 'currency' | 'number';
}

const KPI_TILES: KpiTileConfig[] = [
  { key: 'today_purchase_value', label: "Today's Purchase Value", format: 'currency' },
  { key: 'month_purchase_value', label: 'Monthly Purchase Value', format: 'currency' },
  { key: 'active_vendors_count', label: 'Active Vendors', format: 'number' },
  { key: 'outstanding_vendor_payments', label: 'Outstanding Vendor Payments', format: 'currency' },
];

function formatValue(value: number, format: 'currency' | 'number'): string {
  return format === 'currency' ? `₹${value.toFixed(2)}` : value.toLocaleString();
}

interface ProcurementKpiCardsProps {
  kpis: ProcurementDashboardKpis | undefined;
  isLoading: boolean;
}

export function ProcurementKpiCards({ kpis, isLoading }: ProcurementKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {KPI_TILES.map((tile) => (
        <Card key={tile.key} size="sm">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs font-medium text-muted-foreground">{tile.label}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !kpis ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <p className="text-xl font-semibold tracking-tight">{formatValue(kpis[tile.key], tile.format)}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
