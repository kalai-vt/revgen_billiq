import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Printer, Undo2, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import * as posApi from '@/features/pos/api';
import { InvoiceReceiptSummary } from '@/features/pos/components/InvoiceReceiptSummary';
import { invoiceStatusBadgeClassName, invoiceStatusLabel } from '@/features/pos/lib/invoiceStatus';
import { paymentStatusBadgeClassName, paymentStatusLabel } from '@/features/payments/lib/paymentStatus';
import { ReceivePaymentDialog } from '@/features/payments/components/ReceivePaymentDialog';
import { ApiError } from '@/lib/api-client';
import { appPath } from '@/lib/app-path';

interface ViewInvoiceDialogProps {
  invoiceId: string | null;
  onClose: () => void;
  canReturn?: boolean;
  onReturn?: (invoiceId: string) => void;
}

export function ViewInvoiceDialog({ invoiceId, onClose, canReturn = false, onReturn }: ViewInvoiceDialogProps) {
  const queryClient = useQueryClient();
  const [receivePaymentOpen, setReceivePaymentOpen] = useState(false);
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => posApi.getInvoice(invoiceId!),
    enabled: !!invoiceId,
  });

  async function handleDownloadPdf() {
    if (!invoice) return;
    try {
      const blob = await posApi.downloadInvoicePdf(invoice.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.invoice_number}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not download PDF');
    }
  }

  function handlePrint() {
    if (!invoice) return;
    window.open(appPath(`/invoices/${invoice.id}/print`), '_blank', 'noopener,noreferrer');
  }

  return (
    <Dialog open={!!invoiceId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {isLoading || !invoice ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {invoice.invoice_number}
                <Badge variant="outline" className={invoiceStatusBadgeClassName(invoice.status)}>
                  {invoiceStatusLabel(invoice.status)}
                </Badge>
                {invoice.status !== 'cancelled' && invoice.payment_status !== 'paid' && (
                  <Badge variant="outline" className={paymentStatusBadgeClassName(invoice.payment_status, invoice.is_overdue)}>
                    {paymentStatusLabel(invoice.payment_status, invoice.is_overdue)}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-0.5 text-sm text-muted-foreground">
              <p>{new Date(invoice.created_at).toLocaleString()}</p>
              {invoice.customer_name && <p>Customer: {invoice.customer_name}</p>}
              {invoice.customer_phone && <p>Phone: {invoice.customer_phone}</p>}
            </div>
            <InvoiceReceiptSummary invoice={invoice} />
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
                {canReturn && onReturn && (invoice.status === 'paid' || invoice.status === 'partial') && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      onReturn(invoice.id);
                      onClose();
                    }}
                  >
                    <Undo2 className="size-4" />
                    Return
                  </Button>
                )}
                {invoice.customer_id && invoice.outstanding_amount > 0 && invoice.status !== 'cancelled' && (
                  <Button variant="outline" onClick={() => setReceivePaymentOpen(true)}>
                    <Wallet className="size-4" />
                    Receive Payment
                  </Button>
                )}
              </div>
              <Button onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
      {invoice?.customer_id && (
        <ReceivePaymentDialog
          open={receivePaymentOpen}
          customerId={invoice.customer_id}
          onClose={() => setReceivePaymentOpen(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })}
        />
      )}
    </Dialog>
  );
}
