import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardKpis } from '@/features/analytics/api';

interface KpiCardsProps {
  kpis: DashboardKpis;
}

export function KpiCards({ kpis }: KpiCardsProps) {
  const tiles = [
    { label: "Today's Revenue", value: kpis.today_revenue.toFixed(2) },
    { label: "Today's Bills", value: kpis.today_bill_count.toLocaleString() },
    { label: "Today's Units Sold", value: kpis.today_units_sold.toLocaleString() },
    { label: 'Products', value: kpis.total_products.toLocaleString() },
    { label: 'Customers', value: kpis.total_customers.toLocaleString() },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{tile.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">{tile.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
