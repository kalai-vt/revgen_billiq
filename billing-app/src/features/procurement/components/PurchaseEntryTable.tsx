import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, PackageSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import * as procurementApi from '@/features/procurement/api';
import type { PurchaseEntryListItem, PurchaseEntryListResult, PurchaseSortField } from '@/features/procurement/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/lib/api-client';

interface PurchaseEntryTableProps {
  data?: PurchaseEntryListResult;
  isLoading: boolean;
  sortBy: PurchaseSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: PurchaseSortField) => void;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  received: { label: 'Received', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  cancelled: { label: 'Cancelled', className: 'bg-destructive/10 text-destructive' },
};

const PAYMENT_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  partial: { label: 'Partial', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  unpaid: { label: 'Unpaid', className: 'bg-destructive/10 text-destructive' },
};

export const PurchaseEntryTable = memo(function PurchaseEntryTable({ data, isLoading, sortBy, sortDir, onSort }: PurchaseEntryTableProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCancel = user?.role === 'owner';
  const queryClient = useQueryClient();
  const [pendingCancel, setPendingCancel] = useState<PurchaseEntryListItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const cancelMutation = useMutation({
    mutationFn: (vars: { id: string; reason: string }) => procurementApi.cancelPurchase(vars.id, vars.reason || null),
    onSuccess: () => {
      toast.success('Purchase cancelled');
      queryClient.invalidateQueries({ queryKey: ['procurement-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-vendors'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setPendingCancel(null);
      setCancelReason('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Purchase #</TableHead>
            <TableHead>Vendor</TableHead>
            <SortableTableHead field="purchase_date" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="hidden sm:table-cell">
              Date
            </SortableTableHead>
            <TableHead>Status</TableHead>
            <SortableTableHead field="total_amount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="text-right">
              Total
            </SortableTableHead>
            <TableHead className="hidden md:table-cell">Payment</TableHead>
            <TableHead className="hidden lg:table-cell text-right">Outstanding</TableHead>
            {canCancel && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={8}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {!isLoading && data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8}>
                <EmptyState icon={PackageSearch} title="No purchases found" description="Record a purchase or adjust your filters." />
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((purchase) => {
            const statusBadge = STATUS_BADGE[purchase.status];
            const paymentBadge = PAYMENT_BADGE[purchase.payment_status];
            return (
              <TableRow key={purchase.id} className="cursor-pointer" onClick={() => navigate(`/procurement/purchases/${purchase.id}`)}>
                <TableCell className="font-medium">{purchase.purchase_number}</TableCell>
                <TableCell className="max-w-[160px] truncate">{purchase.vendor_name}</TableCell>
                <TableCell className="hidden sm:table-cell">{new Date(purchase.purchase_date).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusBadge.className}>
                    {statusBadge.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">{purchase.total_amount.toFixed(2)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="outline" className={paymentBadge.className}>
                    {paymentBadge.label}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-right lg:table-cell">
                  {purchase.outstanding_amount > 0 ? purchase.outstanding_amount.toFixed(2) : '—'}
                </TableCell>
                {canCancel && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {purchase.status !== 'cancelled' && (
                      <IconButton
                        tooltip="Cancel purchase"
                        className="size-8"
                        aria-label={`Cancel ${purchase.purchase_number}`}
                        onClick={() => setPendingCancel(purchase)}
                      >
                        <Ban className="size-4" />
                      </IconButton>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ConfirmationDialog
        open={!!pendingCancel}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCancel(null);
            setCancelReason('');
          }
        }}
        title={`Cancel purchase ${pendingCancel?.purchase_number}?`}
        description="This reverses the stock it added and reduces the vendor's outstanding balance. Cost price is not retroactively reversed."
        confirmLabel="Cancel purchase"
        destructive
        isConfirming={cancelMutation.isPending}
        onConfirm={() => pendingCancel && cancelMutation.mutate({ id: pendingCancel.id, reason: cancelReason })}
      >
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">Reason (optional)</Label>
          <Input id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </div>
      </ConfirmationDialog>
    </>
  );
});
