import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as posApi from '@/features/pos/api';
import * as settingsApi from '@/features/settings/api';
import { TemplatePreview, paperSizeToPreviewMode, type BrandingValues } from '@/features/invoice-designer/components/TemplatePreview';
import { PrintPaperStyle } from '@/lib/printing/printPage';
import { useTemplateForDocument } from '@/features/invoice-designer/hooks';
import { invoiceToPreviewData } from '@/features/invoice-designer/lib/mapInvoiceToPreviewData';
import { getPromotionConfig } from '@/features/invoice-designer/api';
import { apiErrorMessage } from '@/lib/query-error';

export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useAuth();
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => posApi.getInvoice(id!),
    enabled: !!id,
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });
  const { template, isLoading: isTemplateLoading, error: templateError } = useTemplateForDocument('tax_invoice');
  // Never gates the print flow — a slow/failed promotion fetch must not delay or block the
  // actual invoice, which is core functionality this feature must never interfere with.
  const { data: promotionContent } = useQuery({ queryKey: ['promotion-config'], queryFn: getPromotionConfig });

  useEffect(() => {
    if (invoice && template) {
      const timer = setTimeout(() => window.print(), 300);
      return () => clearTimeout(timer);
    }
  }, [invoice, template]);

  if (templateError) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        {apiErrorMessage(templateError, "Couldn't load the invoice template — this feature may not be available on your plan.")}
      </div>
    );
  }

  if (isLoading || isTemplateLoading || !invoice || !template || !settings) {
    return <div className="p-8 text-sm text-muted-foreground">Loading invoice…</div>;
  }

  const branding: BrandingValues = {
    company_name: tenant?.company_name ?? '',
    phone: tenant?.phone ?? null,
    email: tenant?.email ?? null,
    logo_url: settings.logo_url,
    gst_number: settings.gst_number,
    tagline: settings.tagline,
    address_line1: settings.address_line1,
    address_line2: settings.address_line2,
    city: settings.city,
    state: settings.state,
    pincode: settings.pincode,
    website: settings.website,
    pan_number: settings.pan_number,
    fssai_number: settings.fssai_number,
    drug_license_number: settings.drug_license_number,
    msme_udyam_number: settings.msme_udyam_number,
    social_links: settings.social_links,
    feedback_url: settings.feedback_url,
    upi_vpa: settings.upi_vpa,
  };

  return (
    <div data-slot="print-sheet" className="mx-auto max-w-2xl p-8">
      <PrintPaperStyle paperSize={settings.auto_print_paper_size} />
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      <TemplatePreview
        config={template.config}
        branding={branding}
        mode={paperSizeToPreviewMode(settings.auto_print_paper_size)}
        data={invoiceToPreviewData(invoice, settings.date_format, settings.decimal_precision)}
        promotionContent={promotionContent ?? null}
      />
    </div>
  );
}
