import { TableCard } from '@/components/shared/TableCard';
import type { ExportFormat } from '@/components/shared/ExportDropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TopProduct } from '@/features/analytics/api';

interface TopProductsTableProps {
  data: TopProduct[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function TopProductsTable({ data, isLoading, onExport }: TopProductsTableProps) {
  return (
    <TableCard title="Top Selling Products" isLoading={isLoading} isEmpty={data.length === 0} emptyLabel="No sales yet" onExport={onExport}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="hidden sm:table-cell">Identifier</TableHead>
            <TableHead className="text-right">Qty Sold</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((product) => (
            <TableRow key={product.product_id}>
              <TableCell className="font-medium">{product.name}</TableCell>
              <TableCell className="hidden sm:table-cell">{product.identifier_value}</TableCell>
              <TableCell className="text-right">{product.qty_sold}</TableCell>
              <TableCell className="text-right">{product.revenue.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
