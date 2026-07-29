import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookText, Pencil, Trash2, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton, TooltipWrap } from '@/components/ui/icon-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import * as procurementApi from '@/features/procurement/api';
import type { Vendor, VendorListResult, VendorSortField } from '@/features/procurement/api';
import { VendorFormDialog } from '@/features/procurement/components/VendorFormDialog';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/lib/api-client';

interface VendorTableProps {
  data?: VendorListResult;
  isLoading: boolean;
  sortBy: VendorSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: VendorSortField) => void;
}

export const VendorTable = memo(function VendorTable({ data, isLoading, sortBy, sortDir, onSort }: VendorTableProps) {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'manager';
  const canDelete = user?.role === 'owner';
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<Vendor | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => procurementApi.deleteVendor(id),
    onSuccess: () => {
      toast.success('Vendor deleted');
      queryClient.invalidateQueries({ queryKey: ['procurement-vendors'] });
      setPendingDelete(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
      setPendingDelete(null);
    },
  });

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead field="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>
              Vendor
            </SortableTableHead>
            <TableHead className="hidden sm:table-cell">Contact</TableHead>
            <TableHead className="hidden md:table-cell">Phone</TableHead>
            <SortableTableHead field="outstanding_amount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="text-right">
              Outstanding
            </SortableTableHead>
            <TableHead className="hidden lg:table-cell text-right">Credit Limit</TableHead>
            <TableHead>Status</TableHead>
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
                <EmptyState icon={Truck} title="No vendors found" description="Add a vendor or adjust your search." />
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((vendor) => (
            <TableRow key={vendor.id}>
              <TableCell className="max-w-[180px] truncate font-medium">
                {vendor.name}
                {vendor.company_name && <p className="truncate text-xs text-muted-foreground">{vendor.company_name}</p>}
              </TableCell>
              <TableCell className="hidden truncate sm:table-cell">{vendor.contact_person ?? '—'}</TableCell>
              <TableCell className="hidden truncate md:table-cell">{vendor.phone ?? '—'}</TableCell>
              <TableCell className="text-right">
                {vendor.outstanding_amount > 0 ? (
                  <span className="font-medium text-destructive">{vendor.outstanding_amount.toFixed(2)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden text-right text-muted-foreground lg:table-cell">
                {vendor.credit_limit > 0 ? vendor.credit_limit.toFixed(2) : '—'}
              </TableCell>
              <TableCell>
                {vendor.is_active ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">
                    Inactive
                  </Badge>
                )}
              </TableCell>
              {canEdit && (
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <TooltipWrap tooltip="View ledger">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`View ledger for ${vendor.name}`}
                        nativeButton={false}
                        render={<Link to={`/procurement/vendors/${vendor.id}/ledger`} />}
                      >
                        <BookText className="size-4" />
                      </Button>
                    </TooltipWrap>
                    <TooltipWrap tooltip="Edit vendor">
                      <VendorFormDialog
                        vendor={vendor}
                        trigger={
                          <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${vendor.name}`}>
                            <Pencil className="size-4" />
                          </Button>
                        }
                      />
                    </TooltipWrap>
                    {canDelete && (
                      <IconButton
                        tooltip="Delete vendor"
                        className="size-8"
                        aria-label={`Delete ${vendor.name}`}
                        onClick={() => setPendingDelete(vendor)}
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
        description="This cannot be undone. Vendors with purchase history can't be deleted — deactivate them instead."
        confirmLabel="Delete"
        destructive
        isConfirming={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </>
  );
});
