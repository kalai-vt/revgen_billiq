import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Ban, CheckCircle2, Printer, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import * as procurementApi from '@/features/procurement/api';
import { PurchaseReturnFormDialog } from '@/features/procurement/components/PurchaseReturnFormDialog';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useFeatureFlag } from '@/features/settings/hooks/useFeatureFlags';
import { ApiError } from '@/lib/api-client';

export function PurchaseEntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: purchase, isLoading } = useQuery({
    queryKey: ['procurement-purchase', id],
    queryFn: () => procurementApi.getPurchase(id!),
    enabled: !!id,
  });
  const returnsEnabled = useFeatureFlag('purchase_returns');

  const confirmMutation = useMutation({
    mutationFn: () => procurementApi.confirmPurchase(id!),
    onSuccess: () => {
      toast.success('Purchase confirmed');
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase', id] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => procurementApi.cancelPurchase(id!, cancelReason || null),
    onSuccess: () => {
      toast.success('Purchase cancelled');
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase', id] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setCancelOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  if (isLoading || !purchase) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const canConfirm = purchase.status === 'draft' && (user?.role === 'owner' || user?.role === 'manager');
  const canCancel = purchase.status !== 'cancelled' && user?.role === 'owner';
  const canReturn =
    returnsEnabled &&
    purchase.status === 'received' &&
    (user?.role === 'owner' || user?.role === 'manager') &&
    purchase.items.some((item) => item.quantity - item.returned_quantity > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link to="/procurement/purchases" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{purchase.purchase_number}</h1>
            <p className="text-sm text-muted-foreground">{purchase.vendor_name}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canConfirm && (
            <Button size="sm" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
              <CheckCircle2 className="size-4" />
              Confirm purchase
            </Button>
          )}
          {canReturn && (
            <PurchaseReturnFormDialog
              purchase={purchase}
              trigger={
                <Button size="sm" variant="outline">
                  <Undo2 className="size-4" />
                  Return items
                </Button>
              }
            />
          )}
          {canCancel && (
            <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
              <Ban className="size-4" />
              Cancel
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Status">
              <StatusBadge status={purchase.status} />
            </Row>
            <Row label="Purchase date">{new Date(purchase.purchase_date).toLocaleDateString()}</Row>
            <Row label="Vendor invoice #">{purchase.vendor_invoice_number ?? '—'}</Row>
            <Row label="Payment mode">{purchase.payment_mode ?? '—'}</Row>
            <Row label="Due date">{purchase.due_date ? new Date(purchase.due_date).toLocaleDateString() : '—'}</Row>
            <Row label="Created by">{purchase.created_by_name}</Row>
            {purchase.status === 'cancelled' && (
              <>
                <Row label="Cancelled at">{purchase.cancelled_at ? new Date(purchase.cancelled_at).toLocaleString() : '—'}</Row>
                <Row label="Reason">{purchase.cancel_reason ?? '—'}</Row>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Payment status">
              <PaymentBadge status={purchase.payment_status} />
            </Row>
            <Row label="Paid amount">{purchase.paid_amount.toFixed(2)}</Row>
            <Row label="Outstanding">{purchase.outstanding_amount.toFixed(2)}</Row>
            {purchase.remarks && <Row label="Remarks">{purchase.remarks}</Row>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Cost price</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchase.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.product_name}</TableCell>
                  <TableCell className="text-right">
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ''}
                  </TableCell>
                  <TableCell className="text-right">{item.unit_cost_price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{item.tax_amount.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium">{item.line_total.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="ml-auto max-w-xs space-y-1 rounded-md border p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{purchase.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span>{purchase.tax_amount.toFixed(2)}</span>
        </div>
        {purchase.discount_amount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span>-{purchase.discount_amount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <span>Total</span>
          <span>{purchase.total_amount.toFixed(2)}</span>
        </div>
      </div>

      <ConfirmationDialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) setCancelReason('');
        }}
        title={`Cancel ${purchase.purchase_number}?`}
        description="This reverses the stock it added and reduces the vendor's outstanding balance. Cost price is not retroactively reversed."
        confirmLabel="Cancel purchase"
        destructive
        isConfirming={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
      >
        <div className="space-y-1.5">
          <Label htmlFor="detail-cancel-reason">Reason (optional)</Label>
          <Input id="detail-cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </div>
      </ConfirmationDialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
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

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGE[status];
  return (
    <Badge variant="outline" className={badge.className}>
      {badge.label}
    </Badge>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const badge = PAYMENT_BADGE[status];
  return (
    <Badge variant="outline" className={badge.className}>
      {badge.label}
    </Badge>
  );
}
