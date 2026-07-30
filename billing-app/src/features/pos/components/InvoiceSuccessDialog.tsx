import { useEffect, useRef, useState } from 'react';
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
import { useTemplateForDocument } from '@/features/invoice-designer/hooks';
import * as qzTray from '@/lib/printing/qzTray';
import * as webUsbPrinter from '@/lib/printing/webUsbPrinter';
import * as webBluetoothPrinter from '@/lib/printing/webBluetoothPrinter';
import { loadDeviceMode } from '@/lib/printing/deviceProfile';
import { buildReceiptCommands, numberToWordsInr, type ThermalPaperSize } from '@/lib/printing/escpos';
import { buildLogoCommand } from '@/lib/printing/escposLogo';
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
  // Which transport *this device* prints through — see deviceProfile.ts. QZ Tray keeps using the
  // tenant-wide printer name from Settings; the Web USB/Bluetooth transports pair per-device and
  // always print thermal ESC/POS, since neither can render the Invoice Designer PDF the way QZ's
  // printPdf can for non-thermal paper sizes.
  const [deviceMode] = useState(() => loadDeviceMode());
  const usesQzThermal = deviceMode === 'qz' && !!autoPrintPrinterName && isThermalPaperSize(autoPrintPaperSize);
  const usesWebTransport =
    (deviceMode === 'web-usb' || deviceMode === 'web-bluetooth') && isThermalPaperSize(autoPrintPaperSize);
  const needsThermalSettings = autoPrint && (usesQzThermal || usesWebTransport);
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.getSettings,
    enabled: needsThermalSettings,
  });
  // The tenant's tax_invoice template drives which phone/round-off/footer/QR elements the
  // thermal receipt shows — same template AutoPrintSettingsForm.tsx already checks paper size
  // against, so thermal output stays in sync with what's actually configured in Designer.
  const { template: taxInvoiceTemplate } = useTemplateForDocument('tax_invoice');

  useEffect(() => {
    if (!invoice || !autoPrint || autoPrintedFor.current === invoice.id) return;
    // Thermal receipts need business/branding fields (address, GST, footer) from Settings
    // before they can be laid out — wait for that fetch rather than firing prematurely.
    if (needsThermalSettings && !settings) return;
    autoPrintedFor.current = invoice.id;
    const invoiceId = invoice.id;
    const currentInvoice = invoice;

    function buildCommands(paperSize: ThermalPaperSize, logoCommand: string | null) {
      if (!settings) return null;
      const companyName = tenant?.company_name ?? 'Receipt';
      const config = taxInvoiceTemplate?.config;

      // Mirrors backend/app/modules/invoice_designer/pdf_renderer.py's QR payloads exactly, so
      // thermal, on-screen, and PDF receipts encode the same data for each QR type.
      const qrCodes: { caption: string; data: string }[] = [];
      if (config?.qr_barcode.invoice_qr) {
        qrCodes.push({
          caption: 'Invoice QR',
          data: `Invoice:${currentInvoice.invoice_number}|Amount:${currentInvoice.total_amount.toFixed(2)}`,
        });
      }
      if (config?.qr_barcode.payment_qr) {
        qrCodes.push({ caption: 'Scan to Pay', data: `upi://pay?pn=${companyName}&am=${currentInvoice.total_amount.toFixed(2)}` });
      }
      if (config?.qr_barcode.business_qr) {
        qrCodes.push({ caption: 'Business Card', data: `${companyName}\n${tenant?.phone ?? ''}\n${tenant?.email ?? ''}` });
      }
      if (config?.qr_barcode.website_qr && settings.website) {
        qrCodes.push({ caption: 'Visit Us', data: settings.website });
      }
      if (config?.qr_barcode.feedback_qr && settings.feedback_url) {
        qrCodes.push({ caption: 'Feedback', data: settings.feedback_url });
      }

      const footerSections = (config?.footer.sections ?? [])
        .filter((section) => section.enabled)
        .sort((a, b) => a.order - b.order)
        .map((section) => ({ text: section.text }));

      const info = config?.invoice_info.fields;
      const customerFields = config?.customer_details.fields;
      const tax = config?.tax_summary.fields;
      const formatEnumLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      return buildReceiptCommands(
        {
          companyName,
          addressLine1: settings.address_line1,
          addressLine2: settings.address_line2,
          city: settings.city,
          state: settings.state,
          pincode: settings.pincode,
          gstNumber: settings.gst_number,
          phone: config?.branding.show_phone ? tenant?.phone : null,
          logoCommand,
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
          roundOff: tax?.round_off ? 0 : undefined,
          footerSections,
          qrCodes,
          dueDate: currentInvoice.due_date,
          customerId: currentInvoice.customer_id,
          paymentStatus: formatEnumLabel(currentInvoice.payment_status),
          invoiceStatus: formatEnumLabel(currentInvoice.status),
          // The backend's own PDF path labels this "customer_gstin" but actually sources it from
          // the same business GST snapshot as `gstNumber` above — see escpos.ts's field comment.
          customerGstin: settings.gst_number,
          paidAmount: currentInvoice.paid_amount,
          outstandingAmount: currentInvoice.outstanding_amount,
          // Mirrors backend document_data.py's derivation exactly: no real CGST/SGST/IGST split
          // is stored, only the one tax_amount — CGST/SGST assume the common intra-state 50/50
          // split, IGST shows the full amount.
          cgst: tax?.cgst ? currentInvoice.tax_amount / 2 : null,
          sgst: tax?.sgst ? currentInvoice.tax_amount / 2 : null,
          igst: tax?.igst ? currentInvoice.tax_amount : null,
          amountInWords: tax?.amount_in_words ? numberToWordsInr(currentInvoice.total_amount) : null,
          visibility: info && customerFields && tax
            ? {
                invoiceNumber: info.invoice_number,
                date: info.date,
                time: info.time,
                dueDate: info.due_date,
                cashier: info.cashier,
                customerId: info.customer_id,
                paymentMethod: info.payment_method,
                paymentStatus: info.payment_status,
                invoiceStatus: info.invoice_status,
                customerName: customerFields.name,
                customerMobile: customerFields.mobile,
                customerGstin: customerFields.gstin,
                subtotal: tax.subtotal,
                discount: tax.discount,
                grandTotal: tax.grand_total,
                paid: tax.paid,
                outstanding: tax.outstanding || tax.balance,
                amountInWords: tax.amount_in_words,
              }
            : undefined,
        },
        paperSize,
      );
    }

    (async () => {
      const thermal = isThermalPaperSize(autoPrintPaperSize);
      const logoCommand =
        thermal && settings && taxInvoiceTemplate?.config.branding.show_logo && settings.logo_url
          ? await buildLogoCommand(settings.logo_url, autoPrintPaperSize)
          : null;

      if (usesWebTransport && thermal) {
        const commands = buildCommands(autoPrintPaperSize, logoCommand);
        if (commands) {
          try {
            if (deviceMode === 'web-usb') await webUsbPrinter.printRaw(commands);
            else await webBluetoothPrinter.printRaw(commands);
            toast.success('Receipt sent to printer');
            return;
          } catch (err) {
            console.warn(`Silent print via ${deviceMode} failed, falling back to the print dialog:`, err);
          }
        }
      } else if (deviceMode === 'qz' && autoPrintPrinterName) {
        try {
          if (thermal) {
            const commands = buildCommands(autoPrintPaperSize, logoCommand);
            if (!commands) throw new Error('Business settings were not available for the receipt.');
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
  }, [
    invoice,
    autoPrint,
    autoPrintPrinterName,
    autoPrintPaperSize,
    needsThermalSettings,
    settings,
    tenant,
    deviceMode,
    usesWebTransport,
    taxInvoiceTemplate,
  ]);

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
