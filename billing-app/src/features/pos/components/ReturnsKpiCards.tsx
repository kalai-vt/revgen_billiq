import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReturnsDashboard } from '@/features/pos/api';

interface ReturnsKpiCardsProps {
  dashboard: ReturnsDashboard;
}

export function ReturnsKpiCards({ dashboard }: ReturnsKpiCardsProps) {
  const tiles = [
    { label: "Today's Returns", value: dashboard.today_return_count.toLocaleString() },
    { label: "Today's Refund Amount", value: dashboard.today_refund_amount.toFixed(2) },
    { label: 'Returns This Month', value: dashboard.month_return_count.toLocaleString() },
    { label: 'Returned Products (Today)', value: dashboard.today_returned_product_qty.toLocaleString() },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
