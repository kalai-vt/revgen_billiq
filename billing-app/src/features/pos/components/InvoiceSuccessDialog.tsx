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
import type { AutoPrintDeviceMode, AutoPrintPaperSize } from '@/features/settings/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useTemplateForDocument } from '@/features/invoice-designer/hooks';
import { getPromotionConfig } from '@/features/invoice-designer/api';
import * as qzTray from '@/lib/printing/qzTray';
import * as printAgentClient from '@/lib/printing/printAgentClient';
import * as webUsbPrinter from '@/lib/printing/webUsbPrinter';
import * as webBluetoothPrinter from '@/lib/printing/webBluetoothPrinter';
import { resolveDeviceMode } from '@/lib/printing/deviceProfile';
import { buildReceiptCommands, type ThermalPaperSize } from '@/lib/printing/escpos';
import { buildLogoCommand } from '@/lib/printing/escposLogo';
import { buildInvoiceReceiptPayload, buildQrImageCommands, type QrImageCommands } from '@/features/pos/lib/silentPrint';
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
  /** Tenant-wide transport from Settings; this device's own override still wins over it. */
  autoPrintDeviceMode?: AutoPrintDeviceMode | null;
}

export function InvoiceSuccessDialog({
  invoice,
  onClose,
  autoPrint = false,
  autoPrintPrinterName = null,
  autoPrintPaperSize = '80mm',
  autoPrintDeviceMode = null,
}: InvoiceSuccessDialogProps) {
  const autoPrintedFor = useRef<string | null>(null);
  const { tenant } = useAuth();
  // Which transport this till prints through — the tenant-wide setting, with this device's own
  // override on top for Web USB/Bluetooth pairings that can only exist here (deviceProfile.ts).
  // QZ Tray keeps using the tenant-wide printer name from Settings; the Web USB/Bluetooth
  // transports always print thermal ESC/POS, since neither can render the Invoice Designer PDF
  // the way QZ's printPdf can for non-thermal paper sizes.
  const [deviceMode] = useState(() => resolveDeviceMode(autoPrintDeviceMode));
  const usesQzThermal = deviceMode === 'qz' && !!autoPrintPrinterName && isThermalPaperSize(autoPrintPaperSize);
  const usesAgentThermal =
    deviceMode === 'revgenai-agent' && !!autoPrintPrinterName && isThermalPaperSize(autoPrintPaperSize);
  const usesWebTransport =
    (deviceMode === 'web-usb' || deviceMode === 'web-bluetooth') && isThermalPaperSize(autoPrintPaperSize);
  const needsThermalSettings = autoPrint && (usesQzThermal || usesAgentThermal || usesWebTransport);
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.getSettings,
    enabled: needsThermalSettings,
  });
  // The tenant's tax_invoice template drives which phone/round-off/footer/QR elements the
  // thermal receipt shows — same template AutoPrintSettingsForm.tsx already checks paper size
  // against, so thermal output stays in sync with what's actually configured in Designer.
  const { template: taxInvoiceTemplate, isLoading: isTemplateLoading } = useTemplateForDocument('tax_invoice');
  const { data: promotionContent } = useQuery({
    queryKey: ['promotion-config'],
    queryFn: getPromotionConfig,
    enabled: needsThermalSettings,
  });

  useEffect(() => {
    if (!invoice || !autoPrint || autoPrintedFor.current === invoice.id) return;
    // Thermal receipts need business/branding fields (address, GST, footer) from Settings, plus
    // the tax_invoice template's element toggles (logo/QR/footer sections) — wait for both fetches
    // rather than firing with a half-loaded config on the first auto-print after login.
    if (needsThermalSettings && (!settings || isTemplateLoading)) return;
    autoPrintedFor.current = invoice.id;
    const invoiceId = invoice.id;
    const currentInvoice = invoice;

    // Returns the raw business/receipt data, unrendered — the QZ/USB/Bluetooth transports render
    // it locally via buildReceiptCommands (see call sites below); the RevGenAI Print Agent
    // transport instead sends this data as-is and lets the agent render it itself (it ported the
    // same escpos.ts logic byte-for-byte — see print-agent/src/renderer/escpos.ts), so BillIQ
    // never needs to know which printer protocol the agent ends up using. Shared with
    // silentPrint.ts's own manual-print entry points so an invoice's receipt renders identically
    // whether it was auto-printed here or reprinted later from the Invoices list.
    function buildReceiptPayload(logoCommand: string | null, qrImages: QrImageCommands = {}) {
      if (!settings) return null;
      return buildInvoiceReceiptPayload(
        currentInvoice,
        { settings, template: taxInvoiceTemplate, promotionContent: promotionContent ?? null, tenant },
        logoCommand,
        qrImages,
      );
    }

    (async () => {
      const thermal = isThermalPaperSize(autoPrintPaperSize);
      const logoCommand =
        thermal && settings && taxInvoiceTemplate?.config.branding.show_logo && settings.logo_url
          ? await buildLogoCommand(settings.logo_url, autoPrintPaperSize)
          : null;
      // Rasterized here for the same reason as the logo: the payload builders are synchronous,
      // and a tenant's uploaded QR needs a fetch and a canvas pass before it can be printed.
      const qrImages = thermal ? await buildQrImageCommands(taxInvoiceTemplate?.config, autoPrintPaperSize) : {};

      if (usesWebTransport && thermal) {
        const receipt = buildReceiptPayload(logoCommand, qrImages);
        if (receipt) {
          try {
            const commands = buildReceiptCommands(receipt.business, receipt.data, autoPrintPaperSize);
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
            const receipt = buildReceiptPayload(logoCommand, qrImages);
            if (!receipt) throw new Error('Business settings were not available for the receipt.');
            await qzTray.printRaw(autoPrintPrinterName, buildReceiptCommands(receipt.business, receipt.data, autoPrintPaperSize));
          } else {
            const pdf = await posApi.downloadInvoicePdf(invoiceId);
            await qzTray.printPdf(autoPrintPrinterName, pdf);
          }
          toast.success(`Receipt sent to ${autoPrintPrinterName}`);
          return;
        } catch (err) {
          console.warn('Silent print via QZ Tray failed, falling back to the print dialog:', err);
        }
      } else if (deviceMode === 'revgenai-agent' && autoPrintPrinterName) {
        try {
          if (thermal) {
            const receipt = buildReceiptPayload(logoCommand, qrImages);
            if (!receipt) throw new Error('Business settings were not available for the receipt.');
            await printAgentClient.printThermal(autoPrintPrinterName, receipt.business, receipt.data, autoPrintPaperSize);
          } else {
            const pdf = await posApi.downloadInvoicePdf(invoiceId);
            await printAgentClient.printPdf(autoPrintPrinterName, pdf);
          }
          toast.success(`Receipt sent to ${autoPrintPrinterName}`);
          return;
        } catch (err) {
          console.warn('Silent print via RevGenAI Print Agent failed, falling back to the print dialog:', err);
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
    isTemplateLoading,
    promotionContent,
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
