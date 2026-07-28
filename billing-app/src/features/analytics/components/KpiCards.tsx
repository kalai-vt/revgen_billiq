import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardKpis } from '@/features/analytics/api';

interface KpiTileConfig {
  key: keyof DashboardKpis;
  label: string;
  format: 'currency' | 'number';
  scope: 'range' | 'allTime';
}

const KPI_TILES: KpiTileConfig[] = [
  { key: 'total_sales', label: 'Total Sales', format: 'currency', scope: 'range' },
  { key: 'net_sales', label: 'Net Sales', format: 'currency', scope: 'range' },
  { key: 'total_orders', label: 'Total Orders', format: 'number', scope: 'range' },
  { key: 'average_order_value', label: 'Average Order Value', format: 'currency', scope: 'range' },
  { key: 'new_customers', label: 'New Customers', format: 'number', scope: 'range' },
  { key: 'credit_sales', label: 'Credit Sales', format: 'currency', scope: 'range' },
  { key: 'cash_sales', label: 'Cash Sales', format: 'currency', scope: 'range' },
  { key: 'card_payments', label: 'Card Payments', format: 'currency', scope: 'range' },
  { key: 'upi_payments', label: 'UPI Payments', format: 'currency', scope: 'range' },
  { key: 'returned_orders', label: 'Returned Orders', format: 'number', scope: 'range' },
  { key: 'discount_amount', label: 'Discount Amount', format: 'currency', scope: 'range' },
  { key: 'tax_collected', label: 'Tax Collected', format: 'currency', scope: 'range' },
  { key: 'total_customers', label: 'Total Customers', format: 'number', scope: 'allTime' },
  { key: 'total_products', label: 'Total Products', format: 'number', scope: 'allTime' },
  { key: 'outstanding_amount', label: 'Outstanding Amount', format: 'currency', scope: 'allTime' },
];

function formatValue(value: number, format: 'currency' | 'number'): string {
  return format === 'currency' ? `₹${value.toFixed(2)}` : value.toLocaleString();
}

interface KpiCardsProps {
  kpis: DashboardKpis | undefined;
  isLoading: boolean;
}

export function KpiCards({ kpis, isLoading }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
            {tile.scope === 'allTime' && <p className="mt-0.5 text-[11px] text-muted-foreground">as of today</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
