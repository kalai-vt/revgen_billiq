import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { InventoryDashboard } from '@/features/inventory/api';

interface InventoryKpiCardsProps {
  dashboard: InventoryDashboard;
}

export function InventoryKpiCards({ dashboard }: InventoryKpiCardsProps) {
  const tiles = [
    { label: 'Total Products', value: dashboard.total_products.toLocaleString() },
    { label: 'Total Stock Quantity', value: dashboard.total_stock_quantity.toLocaleString() },
    { label: 'Inventory Value', value: dashboard.inventory_value.toFixed(2) },
    { label: 'Low Stock Products', value: dashboard.low_stock_count.toLocaleString(), warn: dashboard.low_stock_count > 0 },
    { label: 'Out of Stock Products', value: dashboard.out_of_stock_count.toLocaleString(), danger: dashboard.out_of_stock_count > 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{tile.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={
                'text-2xl font-semibold tracking-tight' +
                (tile.danger ? ' text-destructive' : tile.warn ? ' text-amber-600 dark:text-amber-500' : '')
              }
            >
              {tile.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
