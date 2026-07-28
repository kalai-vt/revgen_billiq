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
  { key: 'total_sales', label: 'Total Revenue', format: 'currency', scope: 'range' },
  { key: 'net_sales', label: 'Net Sales', format: 'currency', scope: 'range' },
  { key: 'total_orders', label: 'Total Orders', format: 'number', scope: 'range' },
  { key: 'average_order_value', label: 'Average Order Value', format: 'currency', scope: 'range' },
  { key: 'total_units_sold', label: 'Total Products Sold', format: 'number', scope: 'range' },
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

/** Overview's lean 5-tile executive snapshot (Total Revenue/Orders/Customers/AOV/Products Sold).
 * Advanced Analytics shows the full KPI_TILES set by omitting this prop. */
export const OVERVIEW_KPI_KEYS: Array<keyof DashboardKpis> = [
  'total_sales',
  'total_orders',
  'total_customers',
  'average_order_value',
  'total_units_sold',
];

function formatValue(value: number, format: 'currency' | 'number'): string {
  return format === 'currency' ? `₹${value.toFixed(2)}` : value.toLocaleString();
}

interface KpiCardsProps {
  kpis: DashboardKpis | undefined;
  isLoading: boolean;
  /** Restrict to a subset of tiles (by DashboardKpis key), in the given order. Omit for the full set. */
  tiles?: Array<keyof DashboardKpis>;
}

export function KpiCards({ kpis, isLoading, tiles }: KpiCardsProps) {
  const visibleTiles = tiles ? tiles.map((key) => KPI_TILES.find((t) => t.key === key)!).filter(Boolean) : KPI_TILES;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {visibleTiles.map((tile) => (
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
