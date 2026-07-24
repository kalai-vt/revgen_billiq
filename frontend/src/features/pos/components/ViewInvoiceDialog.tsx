import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import * as posApi from '@/features/pos/api';
import { InvoiceReceiptSummary } from '@/features/pos/components/InvoiceReceiptSummary';
import { invoiceStatusBadgeClassName, invoiceStatusLabel } from '@/features/pos/lib/invoiceStatus';
import { ApiError } from '@/lib/api-client';

interface ViewInvoiceDialogProps {
  invoiceId: string | null;
  onClose: () => void;
}

export function ViewInvoiceDialog({ invoiceId, onClose }: ViewInvoiceDialogProps) {
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
    window.open(`/invoices/${invoice.id}/print`, '_blank', 'noopener,noreferrer');
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
              <DialogTitle className="flex items-center gap-2">
                {invoice.invoice_number}
                <Badge variant="outline" className={invoiceStatusBadgeClassName(invoice.status)}>
                  {invoiceStatusLabel(invoice.status)}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-0.5 text-sm text-muted-foreground">
              <p>{new Date(invoice.created_at).toLocaleString()}</p>
              {invoice.customer_name && <p>Customer: {invoice.customer_name}</p>}
              {invoice.customer_phone && <p>Phone: {invoice.customer_phone}</p>}
            </div>
            <InvoiceReceiptSummary invoice={invoice} />
            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <div className="flex gap-2">
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
  );
}
