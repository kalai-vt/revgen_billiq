import { memo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Package, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnResizeHandle } from '@/components/ui/column-resize-handle';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useResizableColumns } from '@/hooks/useResizableColumns';
import * as productsApi from '@/features/products/api';
import { IDENTIFIER_TYPE_LABELS } from '@/features/products/api';
import type { Product, ProductListResult, ProductSortField } from '@/features/products/api';
import { ProductFormDialog } from '@/features/products/components/ProductFormDialog';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ApiError } from '@/lib/api-client';

interface ProductTableProps {
  data?: ProductListResult;
  isLoading: boolean;
  sortBy: ProductSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: ProductSortField) => void;
}

const INITIAL_WIDTHS = { name: 220, identifier: 160, category: 140, cost: 100, price: 100, tax: 90 };

export const ProductTable = memo(function ProductTable({ data, isLoading, sortBy, sortDir, onSort }: ProductTableProps) {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'manager';
  const canDelete = user?.role === 'owner';
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const { widths, startResize } = useResizableColumns(INITIAL_WIDTHS);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productsApi.deleteProduct(id),
    onSuccess: () => {
      toast.success('Product deleted');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setPendingDelete(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <>
      <Table containerClassName="overflow-x-visible overflow-y-visible" className="sm:table-fixed">
        <colgroup>
          <col style={{ width: widths.name }} />
          <col className="hidden sm:table-column" style={{ width: widths.identifier }} />
          <col className="hidden md:table-column" style={{ width: widths.category }} />
          <col className="hidden md:table-column" style={{ width: widths.cost }} />
          <col style={{ width: widths.price }} />
          <col className="hidden md:table-column" style={{ width: widths.tax }} />
          {canEdit && <col style={{ width: 80 }} />}
        </colgroup>
        <TableHeader>
          <TableRow>
            <SortableTableHead field="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>
              Product
              <ColumnResizeHandle onPointerDown={startResize('name')} />
            </SortableTableHead>
            <SortableTableHead field="identifier_value" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="hidden sm:table-cell">
              Identifier
              <ColumnResizeHandle onPointerDown={startResize('identifier')} />
            </SortableTableHead>
            <TableHead className="relative hidden md:table-cell">
              Category
              <ColumnResizeHandle onPointerDown={startResize('category')} />
            </TableHead>
            <SortableTableHead field="cost_price" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="hidden text-right md:table-cell">
              Cost
              <ColumnResizeHandle onPointerDown={startResize('cost')} />
            </SortableTableHead>
            <SortableTableHead field="selling_price" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="text-right">
              Price
              <ColumnResizeHandle onPointerDown={startResize('price')} />
            </SortableTableHead>
            <SortableTableHead field="tax_rate_percent" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="hidden text-right md:table-cell">
              Tax %
              <ColumnResizeHandle onPointerDown={startResize('tax')} />
            </SortableTableHead>
            {canEdit && <TableHead className="w-20" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={7}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {!isLoading && data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                <EmptyState icon={Package} title="No products found" description="Create a product or adjust your filters." />
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((product) => (
            <TableRow key={product.id}>
              <TableCell className="max-w-[160px] truncate font-medium sm:max-w-none">
                {product.name}
                {product.barcode && (
                  <span className="ml-2 text-xs text-muted-foreground">#{product.barcode}</span>
                )}
              </TableCell>
              <TableCell className="hidden truncate sm:table-cell">
                {product.identifier_value}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({IDENTIFIER_TYPE_LABELS[product.identifier_type]})
                </span>
              </TableCell>
              <TableCell className="hidden truncate md:table-cell">
                {product.category_name ? (
                  <Badge variant="outline">{product.category_name}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden text-right md:table-cell">{product.cost_price.toFixed(2)}</TableCell>
              <TableCell className="text-right font-medium">{product.selling_price.toFixed(2)}</TableCell>
              <TableCell className="hidden text-right md:table-cell">{product.tax_rate_percent}%</TableCell>
              {canEdit && (
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <ProductFormDialog
                      product={product}
                      trigger={
                        <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${product.name}`}>
                          <Pencil className="size-4" />
                        </Button>
                      }
                    />
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Delete ${product.name}`}
                        onClick={() => setPendingDelete(product)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.name}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        isConfirming={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </>
  );
});
