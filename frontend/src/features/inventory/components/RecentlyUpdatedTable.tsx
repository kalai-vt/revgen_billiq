import { Boxes } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { InventoryItem } from '@/features/inventory/api';

interface RecentlyUpdatedTableProps {
  items: InventoryItem[];
}

export function RecentlyUpdatedTable({ items }: RecentlyUpdatedTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recently Updated Products</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Current Stock</TableHead>
              <TableHead>Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>
                  <EmptyState icon={Boxes} title="No inventory activity yet" />
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => (
              <TableRow key={item.product_id}>
                <TableCell className="font-medium">{item.product_name}</TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(item.updated_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
