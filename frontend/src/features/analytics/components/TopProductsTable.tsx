import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TopProduct } from '@/features/analytics/api';

interface TopProductsTableProps {
  data: TopProduct[];
}

export function TopProductsTable({ data }: TopProductsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top Selling Products</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Identifier</TableHead>
              <TableHead className="text-right">Qty Sold</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <EmptyState icon={TrendingUp} title="No sales yet" />
                </TableCell>
              </TableRow>
            )}
            {data.map((product) => (
              <TableRow key={product.product_id}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>{product.identifier_value}</TableCell>
                <TableCell className="text-right">{product.qty_sold}</TableCell>
                <TableCell className="text-right">{product.revenue.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
