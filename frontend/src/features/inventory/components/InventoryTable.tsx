import { memo } from 'react';
import { PackagePlus, Boxes } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnResizeHandle } from '@/components/ui/column-resize-handle';
import { EmptyState } from '@/components/ui/empty-state';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useResizableColumns } from '@/hooks/useResizableColumns';
import { IDENTIFIER_TYPE_LABELS } from '@/features/products/api';
import type { IdentifierType } from '@/features/products/api';
import { StockAdjustDialog } from '@/features/inventory/components/StockAdjustDialog';
import type { InventoryListResult, InventorySortField } from '@/features/inventory/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

interface InventoryTableProps {
  data?: InventoryListResult;
  isLoading: boolean;
  sortBy: InventorySortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: InventorySortField) => void;
}

const INITIAL_WIDTHS = { name: 200, identifier: 160, category: 140, quantity: 120, cost: 110, price: 110, tax: 90, updated: 140 };

export const InventoryTable = memo(function InventoryTable({ data, isLoading, sortBy, sortDir, onSort }: InventoryTableProps) {
  const { user } = useAuth();
  const canAdjust = user?.role === 'owner' || user?.role === 'manager';
  const columnCount = canAdjust ? 8 : 7;
  const { widths, startResize } = useResizableColumns(INITIAL_WIDTHS);

  return (
    <Table containerClassName="overflow-x-visible overflow-y-visible" className="sm:table-fixed">
      <colgroup>
        <col style={{ width: widths.name }} />
        <col className="hidden sm:table-column" style={{ width: widths.identifier }} />
        <col className="hidden lg:table-column" style={{ width: widths.category }} />
        <col style={{ width: widths.quantity }} />
        <col className="hidden md:table-column" style={{ width: widths.cost }} />
        <col className="hidden md:table-column" style={{ width: widths.price }} />
        <col className="hidden lg:table-column" style={{ width: widths.tax }} />
        <col className="hidden lg:table-column" style={{ width: widths.updated }} />
        {canAdjust && <col style={{ width: 64 }} />}
      </colgroup>
      <TableHeader>
        <TableRow>
          <SortableTableHead field="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>
            Product
            <ColumnResizeHandle onPointerDown={startResize('name')} />
          </SortableTableHead>
          <TableHead className="relative hidden sm:table-cell">
            Identifier
            <ColumnResizeHandle onPointerDown={startResize('identifier')} />
          </TableHead>
          <TableHead className="relative hidden lg:table-cell">
            Category
            <ColumnResizeHandle onPointerDown={startResize('category')} />
          </TableHead>
          <SortableTableHead field="quantity" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="text-right">
            Current Stock
            <ColumnResizeHandle onPointerDown={startResize('quantity')} />
          </SortableTableHead>
          <SortableTableHead field="cost_price" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="hidden text-right md:table-cell">
            Cost Price
            <ColumnResizeHandle onPointerDown={startResize('cost')} />
          </SortableTableHead>
          <SortableTableHead field="selling_price" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="hidden text-right md:table-cell">
            Selling Price
            <ColumnResizeHandle onPointerDown={startResize('price')} />
          </SortableTableHead>
          <TableHead className="relative hidden text-right lg:table-cell">
            Tax %
            <ColumnResizeHandle onPointerDown={startResize('tax')} />
          </TableHead>
          <SortableTableHead field="updated_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="hidden lg:table-cell">
            Last Updated
            <ColumnResizeHandle onPointerDown={startResize('updated')} />
          </SortableTableHead>
          {canAdjust && <TableHead className="w-16" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell colSpan={columnCount}>
                <Skeleton className="h-5 w-full" />
              </TableCell>
            </TableRow>
          ))}
        {!isLoading && data?.items.length === 0 && (
          <TableRow>
            <TableCell colSpan={columnCount}>
              <EmptyState icon={Boxes} title="No inventory records found" description="Add products or adjust your filters." />
            </TableCell>
          </TableRow>
        )}
        {data?.items.map((item) => (
          <TableRow key={item.product_id}>
            <TableCell className="max-w-[160px] truncate font-medium sm:max-w-none">{item.product_name}</TableCell>
            <TableCell className="hidden truncate sm:table-cell">
              {item.identifier_value}
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({IDENTIFIER_TYPE_LABELS[item.identifier_type as IdentifierType]})
              </span>
            </TableCell>
            <TableCell className="hidden truncate lg:table-cell">
              {item.category_name ? (
                <Badge variant="outline">{item.category_name}</Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <span className="font-medium">{item.quantity}</span>
              {item.is_out_of_stock && (
                <Badge variant="destructive" className="ml-2">
                  Out of stock
                </Badge>
              )}
              {!item.is_out_of_stock && item.is_low_stock && (
                <Badge variant="outline" className="ml-2 border-amber-500 text-amber-600 dark:text-amber-500">
                  Low stock
                </Badge>
              )}
            </TableCell>
            <TableCell className="hidden text-right md:table-cell">{item.cost_price.toFixed(2)}</TableCell>
            <TableCell className="hidden text-right md:table-cell">{item.selling_price.toFixed(2)}</TableCell>
            <TableCell className="hidden text-right lg:table-cell">{item.tax_rate_percent}%</TableCell>
            <TableCell className="hidden truncate text-muted-foreground lg:table-cell">{new Date(item.updated_at).toLocaleDateString()}</TableCell>
            {canAdjust && (
              <TableCell>
                <StockAdjustDialog
                  item={item}
                  trigger={
                    <Button variant="ghost" size="icon" className="size-8" aria-label={`Adjust stock for ${item.product_name}`}>
                      <PackagePlus className="size-4" />
                    </Button>
                  }
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});
