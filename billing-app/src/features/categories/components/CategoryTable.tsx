import { memo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Tags, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton, TooltipWrap } from '@/components/ui/icon-button';
import { ColumnResizeHandle } from '@/components/ui/column-resize-handle';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useResizableColumns } from '@/hooks/useResizableColumns';
import * as categoriesApi from '@/features/categories/api';
import type { Category, CategorySortField } from '@/features/categories/api';
import { CategoryFormDialog } from '@/features/categories/components/CategoryFormDialog';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { ApiError } from '@/lib/api-client';

interface CategoryTableProps {
  categories: Category[];
  isLoading: boolean;
  sortBy: CategorySortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: CategorySortField) => void;
}

const INITIAL_WIDTHS = { name: 220, description: 320 };

export const CategoryTable = memo(function CategoryTable({ categories, isLoading, sortBy, sortDir, onSort }: CategoryTableProps) {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'manager';
  const canDelete = user?.role === 'owner';
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const { widths, startResize } = useResizableColumns(INITIAL_WIDTHS);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.deleteCategory(id),
    onSuccess: () => {
      toast.success('Category deleted');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setPendingDelete(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <>
      <Table containerClassName="overflow-x-visible overflow-y-visible" className="table-fixed">
        <colgroup>
          <col style={{ width: widths.name }} />
          <col className="hidden sm:table-column" style={{ width: widths.description }} />
          {canEdit && <col style={{ width: 80 }} />}
        </colgroup>
        <TableHeader>
          <TableRow>
            <SortableTableHead field="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>
              Name
              <ColumnResizeHandle onPointerDown={startResize('name')} />
            </SortableTableHead>
            <TableHead className="relative hidden sm:table-cell">
              Description
              <ColumnResizeHandle onPointerDown={startResize('description')} />
            </TableHead>
            {canEdit && <TableHead className="w-20" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={3}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {!isLoading && categories.length === 0 && (
            <TableRow>
              <TableCell colSpan={3}>
                <EmptyState icon={Tags} title="No categories yet" description="Create a category to organize your products." />
              </TableCell>
            </TableRow>
          )}
          {categories.map((category) => (
            <TableRow key={category.id}>
              <TableCell className="truncate font-medium">{category.name}</TableCell>
              <TableCell className="hidden truncate text-muted-foreground sm:table-cell">{category.description ?? '—'}</TableCell>
              {canEdit && (
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <TooltipWrap tooltip="Edit Category">
                      <CategoryFormDialog
                        category={category}
                        trigger={
                          <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${category.name}`}>
                            <Pencil className="size-4" />
                          </Button>
                        }
                      />
                    </TooltipWrap>
                    {canDelete && (
                      <IconButton
                        tooltip="Delete Category"
                        className="size-8"
                        aria-label={`Delete ${category.name}`}
                        onClick={() => setPendingDelete(category)}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmationDialog
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
