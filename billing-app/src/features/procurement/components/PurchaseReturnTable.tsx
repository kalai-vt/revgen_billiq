import { memo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import * as procurementApi from '@/features/procurement/api';
import type { PurchaseReturnListItem, PurchaseReturnListResult } from '@/features/procurement/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/lib/api-client';

interface PurchaseReturnTableProps {
  data?: PurchaseReturnListResult;
  isLoading: boolean;
}

export const PurchaseReturnTable = memo(function PurchaseReturnTable({ data, isLoading }: PurchaseReturnTableProps) {
  const { user } = useAuth();
  const canCancel = user?.role === 'owner';
  const queryClient = useQueryClient();
  const [pendingCancel, setPendingCancel] = useState<PurchaseReturnListItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const cancelMutation = useMutation({
    mutationFn: (vars: { id: string; reason: string }) => procurementApi.cancelReturn(vars.id, vars.reason || null),
    onSuccess: () => {
      toast.success('Return cancelled');
      queryClient.invalidateQueries({ queryKey: ['procurement-returns'] });
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
            <TableHead>Return #</TableHead>
            <TableHead>Purchase #</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Refund</TableHead>
            <TableHead className="hidden sm:table-cell">Date</TableHead>
            {canCancel && <TableHead className="w-10" />}
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
                <EmptyState icon={Undo2} title="No returns found" description="Returns recorded against purchases will show up here." />
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((ret) => (
            <TableRow key={ret.id}>
              <TableCell className="font-medium">{ret.return_number}</TableCell>
              <TableCell>{ret.purchase_number}</TableCell>
              <TableCell className="max-w-[160px] truncate">{ret.vendor_name}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={ret.status === 'cancelled' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}
                >
                  {ret.status === 'cancelled' ? 'Cancelled' : 'Completed'}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-medium">{ret.refund_amount.toFixed(2)}</TableCell>
              <TableCell className="hidden sm:table-cell">{new Date(ret.created_at).toLocaleDateString()}</TableCell>
              {canCancel && (
                <TableCell>
                  {ret.status !== 'cancelled' && (
                    <IconButton tooltip="Cancel return" className="size-8" aria-label={`Cancel ${ret.return_number}`} onClick={() => setPendingCancel(ret)}>
                      <Ban className="size-4" />
                    </IconButton>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
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
        title={`Cancel return ${pendingCancel?.return_number}?`}
        description="This reverses the stock decrease and restores the vendor's outstanding balance."
        confirmLabel="Cancel return"
        destructive
        isConfirming={cancelMutation.isPending}
        onConfirm={() => pendingCancel && cancelMutation.mutate({ id: pendingCancel.id, reason: cancelReason })}
      >
        <div className="space-y-1.5">
          <Label htmlFor="return-cancel-reason">Reason (optional)</Label>
          <Input id="return-cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </div>
      </ConfirmationDialog>
    </>
  );
});
