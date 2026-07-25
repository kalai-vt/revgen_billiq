import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as posApi from '@/features/pos/api';
import { INVENTORY_ACTION_LABELS, RETURN_CONDITION_LABELS, RETURN_REASON_LABELS, REFUND_METHOD_LABELS } from '@/features/pos/api';
import type { ReturnCondition, ReturnReason, InventoryAction, RefundMethod } from '@/features/pos/api';
import { ViewInvoiceDialog } from '@/features/pos/components/ViewInvoiceDialog';
import { returnStatusBadgeClassName, returnStatusLabel } from '@/features/pos/lib/returnStatus';
import { ApiError } from '@/lib/api-client';

interface ReturnDetailsDialogProps {
  returnId: string | null;
  onClose: () => void;
}

export function ReturnDetailsDialog({ returnId, onClose }: ReturnDetailsDialogProps) {
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);

  const { data: ret, isLoading } = useQuery({
    queryKey: ['return', returnId],
    queryFn: () => posApi.getReturn(returnId!),
    enabled: !!returnId,
  });

  async function handleDownloadPdf() {
    if (!ret) return;
    try {
      const blob = await posApi.downloadReturnPdf(ret.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${ret.return_number}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not download PDF');
    }
  }

  function handlePrint() {
    if (!ret) return;
    window.open(`/returns/${ret.id}/print`, '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      <Dialog open={!!returnId} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-3xl">
          {isLoading || !ret ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {ret.return_number}
                  <Badge variant="outline" className={returnStatusBadgeClassName(ret.status)}>
                    {returnStatusLabel(ret.status)}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <section className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  <p>Date: {new Date(ret.created_at).toLocaleString()}</p>
                  <p>Processed By: {ret.created_by_name}</p>
                  <p>
                    Invoice:{' '}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setViewInvoiceId(ret.invoice_id)}
                    >
                      {ret.invoice_number}
                    </button>
                  </p>
                  <p>Customer: {ret.customer_name ?? 'Walk-in'}</p>
                  <p>Payment Method: <span className="uppercase">{ret.payment_method}</span></p>
                  <p>Refund Method: {REFUND_METHOD_LABELS[ret.refund_method as RefundMethod] ?? ret.refund_method}</p>
                </section>

                <section>
                  <p className="mb-1.5 font-medium">Returned Items</p>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="hidden sm:table-cell">SKU</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead className="hidden md:table-cell">Condition</TableHead>
                          <TableHead className="hidden md:table-cell">Inventory</TableHead>
                          <TableHead className="text-right">Refund</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ret.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="max-w-[140px] truncate font-medium">{item.product_name}</TableCell>
                            <TableCell className="hidden text-muted-foreground sm:table-cell">{item.identifier_value}</TableCell>
                            <TableCell className="text-right">{item.quantity_returned}</TableCell>
                            <TableCell>{RETURN_REASON_LABELS[item.reason as ReturnReason] ?? item.reason}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              {RETURN_CONDITION_LABELS[item.condition as ReturnCondition] ?? item.condition}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {INVENTORY_ACTION_LABELS[item.inventory_action as InventoryAction] ?? item.inventory_action}
                            </TableCell>
                            <TableCell className="text-right">{item.line_refund_amount.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>

                <section className="space-y-1 border-t pt-3">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{ret.subtotal_amount.toFixed(2)}</span>
                  </div>
                  {ret.discount_adjustment > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Discount adjustment</span>
                      <span>-{ret.discount_adjustment.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax adjustment</span>
                    <span>{ret.tax_adjustment.toFixed(2)}</span>
                  </div>
                  {ret.round_off !== 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Round off</span>
                      <span>{ret.round_off.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-semibold">
                    <span>Grand Refund</span>
                    <span>{ret.refund_amount.toFixed(2)}</span>
                  </div>
                </section>

                <section className="border-t pt-3">
                  <p className="mb-1.5 font-medium">Audit Timeline</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>Created by {ret.created_by_name} — {new Date(ret.created_at).toLocaleString()}</li>
                    {ret.status === 'cancelled' && (
                      <li>
                        Cancelled by {ret.cancelled_by_name} — {ret.cancelled_at && new Date(ret.cancelled_at).toLocaleString()}
                        {ret.cancel_reason ? ` — ${ret.cancel_reason}` : ''}
                      </li>
                    )}
                  </ul>
                </section>
              </div>

              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handlePrint}>
                    <Printer className="size-4" />
                    Print
                  </Button>
                  <Button variant="outline" onClick={handleDownloadPdf}>
                    <Download className="size-4" />
                    PDF
                  </Button>
                </div>
                <Button onClick={onClose}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ViewInvoiceDialog invoiceId={viewInvoiceId} onClose={() => setViewInvoiceId(null)} />
    </>
  );
}
