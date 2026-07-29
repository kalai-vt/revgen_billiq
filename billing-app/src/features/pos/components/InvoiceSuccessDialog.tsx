import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import * as posApi from '@/features/pos/api';
import type { Invoice } from '@/features/pos/api';
import { InvoiceReceiptSummary } from '@/features/pos/components/InvoiceReceiptSummary';
import { WhatsAppShareButton } from '@/features/pos/components/WhatsAppShareButton';
import * as settingsApi from '@/features/settings/api';
import type { AutoPrintPaperSize } from '@/features/settings/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as qzTray from '@/lib/printing/qzTray';
import { buildReceiptCommands, type ThermalPaperSize } from '@/lib/printing/escpos';
import { ApiError } from '@/lib/api-client';
import { appPath } from '@/lib/app-path';

const THERMAL_PAPER_SIZES: AutoPrintPaperSize[] = ['58mm', '80mm'];
function isThermalPaperSize(size: AutoPrintPaperSize): size is ThermalPaperSize {
  return THERMAL_PAPER_SIZES.includes(size);
}

interface InvoiceSuccessDialogProps {
  invoice: Invoice | null;
  onClose: () => void;
  autoPrint?: boolean;
  /** QZ Tray printer name from Settings > Automatic Printing. When set, auto-print tries to
   * print straight to this printer with no dialog — as raw ESC/POS for 58mm/80mm thermal paper
   * (works identically over USB, LAN/WiFi, and Bluetooth once the printer is installed/paired
   * with the OS), or as the Invoice Designer PDF for A5/A4/Letter/Legal. Falls back to opening
   * the print tab on failure or when no printer is configured. */
  autoPrintPrinterName?: string | null;
  autoPrintPaperSize?: AutoPrintPaperSize;
}

export function InvoiceSuccessDialog({
  invoice,
  onClose,
  autoPrint = false,
  autoPrintPrinterName = null,
  autoPrintPaperSize = '80mm',
}: InvoiceSuccessDialogProps) {
  const autoPrintedFor = useRef<string | null>(null);
  const { tenant } = useAuth();
  const needsThermalSettings = autoPrint && !!autoPrintPrinterName && isThermalPaperSize(autoPrintPaperSize);
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.getSettings,
    enabled: needsThermalSettings,
  });

  useEffect(() => {
    if (!invoice || !autoPrint || autoPrintedFor.current === invoice.id) return;
    // Thermal receipts need business/branding fields (address, GST, footer) from Settings
    // before they can be laid out — wait for that fetch rather than firing prematurely.
    if (needsThermalSettings && !settings) return;
    autoPrintedFor.current = invoice.id;
    const invoiceId = invoice.id;
    const currentInvoice = invoice;

    (async () => {
      if (autoPrintPrinterName) {
        try {
          if (isThermalPaperSize(autoPrintPaperSize) && settings) {
            const commands = buildReceiptCommands(
              {
                companyName: tenant?.company_name ?? 'Receipt',
                addressLine1: settings.address_line1,
                addressLine2: settings.address_line2,
                city: settings.city,
                state: settings.state,
                pincode: settings.pincode,
                gstNumber: settings.gst_number,
              },
              {
                invoiceNumber: currentInvoice.invoice_number,
                createdAt: currentInvoice.created_at,
                cashierName: currentInvoice.created_by_name,
                customerName: currentInvoice.customer_name,
                customerPhone: currentInvoice.customer_phone,
                items: currentInvoice.items.map((item) => ({
                  name: item.product_name,
                  quantity: item.quantity,
                  unitPrice: item.unit_price,
                  lineTotal: item.line_total,
                })),
                subtotal: currentInvoice.subtotal,
                discountAmount: currentInvoice.discount_amount,
                taxAmount: currentInvoice.tax_amount,
                taxPercentage: currentInvoice.tax_percentage,
                totalAmount: currentInvoice.total_amount,
                paymentMethod: currentInvoice.payment_method,
                amountTendered: currentInvoice.amount_tendered,
                changeDue: currentInvoice.change_due,
                footer: settings.receipt_footer,
                currency: settings.currency,
                decimalPrecision: settings.decimal_precision,
              },
              autoPrintPaperSize,
            );
            await qzTray.printRaw(autoPrintPrinterName, commands);
          } else {
            const pdf = await posApi.downloadInvoicePdf(invoiceId);
            await qzTray.printPdf(autoPrintPrinterName, pdf);
          }
          toast.success(`Receipt sent to ${autoPrintPrinterName}`);
          return;
        } catch (err) {
          console.warn('Silent print via QZ Tray failed, falling back to the print dialog:', err);
        }
      }
      window.open(appPath(`/invoices/${invoiceId}/print`), '_blank', 'noopener,noreferrer');
    })();
  }, [invoice, autoPrint, autoPrintPrinterName, autoPrintPaperSize, needsThermalSettings, settings, tenant]);

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
