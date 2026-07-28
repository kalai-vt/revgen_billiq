import { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import * as posApi from '@/features/pos/api';
import type { Invoice } from '@/features/pos/api';
import { InvoiceReceiptSummary } from '@/features/pos/components/InvoiceReceiptSummary';
import { WhatsAppShareButton } from '@/features/pos/components/WhatsAppShareButton';
import { ApiError } from '@/lib/api-client';
import { appPath } from '@/lib/app-path';

interface InvoiceSuccessDialogProps {
  invoice: Invoice | null;
  onClose: () => void;
  autoPrint?: boolean;
}

export function InvoiceSuccessDialog({ invoice, onClose, autoPrint = false }: InvoiceSuccessDialogProps) {
  const autoPrintedFor = useRef<string | null>(null);

  useEffect(() => {
    if (invoice && autoPrint && autoPrintedFor.current !== invoice.id) {
      autoPrintedFor.current = invoice.id;
      window.open(appPath(`/invoices/${invoice.id}/print`), '_blank', 'noopener,noreferrer');
    }
  }, [invoice, autoPrint]);

  if (!invoice) return null;

  async function handleDownloadPdf() {
    try {
      const blob = await posApi.downloadInvoicePdf(invoice!.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice!.invoice_number}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not download PDF');
    }
  }

  function handlePrint() {
    window.open(appPath(`/invoices/${invoice!.id}/print`), '_blank', 'noopener,noreferrer');
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sale complete — {invoice.invoice_number}</DialogTitle>
        </DialogHeader>
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
            <WhatsAppShareButton />
          </div>
          <Button onClick={onClose}>New sale</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
