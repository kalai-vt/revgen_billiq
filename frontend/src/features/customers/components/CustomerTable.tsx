import { memo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ColumnResizeHandle } from '@/components/ui/column-resize-handle';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useResizableColumns } from '@/hooks/useResizableColumns';
import * as customersApi from '@/features/customers/api';
import type { Customer, CustomerListResult, CustomerSortField } from '@/features/customers/api';
import { CustomerFormDialog } from '@/features/customers/components/CustomerFormDialog';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ApiError } from '@/lib/api-client';

interface CustomerTableProps {
  data?: CustomerListResult;
  isLoading: boolean;
  sortBy: CustomerSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: CustomerSortField) => void;
}

const INITIAL_WIDTHS = { name: 200, mobile: 140, email: 220, address: 220 };

export const CustomerTable = memo(function CustomerTable({ data, isLoading, sortBy, sortDir, onSort }: CustomerTableProps) {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'manager';
  const canDelete = user?.role === 'owner';
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const { widths, startResize } = useResizableColumns(INITIAL_WIDTHS);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customersApi.deleteCustomer(id),
    onSuccess: () => {
      toast.success('Customer deleted');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setPendingDelete(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <>
      <Table containerClassName="overflow-x-visible overflow-y-visible" className="sm:table-fixed">
        <colgroup>
          <col style={{ width: widths.name }} />
          <col style={{ width: widths.mobile }} />
          <col className="hidden sm:table-column" style={{ width: widths.email }} />
          <col className="hidden md:table-column" style={{ width: widths.address }} />
          {canEdit && <col style={{ width: 80 }} />}
        </colgroup>
        <TableHeader>
          <TableRow>
            <SortableTableHead field="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>
              Name
              <ColumnResizeHandle onPointerDown={startResize('name')} />
            </SortableTableHead>
            <SortableTableHead field="mobile" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>
              Mobile
              <ColumnResizeHandle onPointerDown={startResize('mobile')} />
            </SortableTableHead>
            <SortableTableHead field="email" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="hidden sm:table-cell">
              Email
              <ColumnResizeHandle onPointerDown={startResize('email')} />
            </SortableTableHead>
            <TableHead className="relative hidden md:table-cell">
              Address
              <ColumnResizeHandle onPointerDown={startResize('address')} />
            </TableHead>
            {canEdit && <TableHead className="w-20" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={5}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {!isLoading && data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5}>
                <EmptyState icon={Users} title="No customers found" description="Add a customer or adjust your search." />
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell className="max-w-[160px] truncate font-medium sm:max-w-none">{customer.name}</TableCell>
              <TableCell className="truncate">{customer.mobile ?? '—'}</TableCell>
              <TableCell className="hidden truncate sm:table-cell">{customer.email ?? '—'}</TableCell>
              <TableCell className="hidden truncate text-muted-foreground md:table-cell">
                {customer.address ?? '—'}
              </TableCell>
              {canEdit && (
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <CustomerFormDialog
                      customer={customer}
                      trigger={
                        <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${customer.name}`}>
                          <Pencil className="size-4" />
                        </Button>
                      }
                    />
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Delete ${customer.name}`}
                        onClick={() => setPendingDelete(customer)}
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
