import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as posApi from '@/features/pos/api';
import * as settingsApi from '@/features/settings/api';
import { TemplatePreview, paperSizeToPreviewMode, type BrandingValues } from '@/features/invoice-designer/components/TemplatePreview';
import { useTemplateForDocument } from '@/features/invoice-designer/hooks';
import { invoiceToPreviewData } from '@/features/invoice-designer/lib/mapInvoiceToPreviewData';

export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useAuth();
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => posApi.getInvoice(id!),
    enabled: !!id,
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });
  const { template, isLoading: isTemplateLoading } = useTemplateForDocument('tax_invoice');

  useEffect(() => {
    if (invoice && template) {
      const timer = setTimeout(() => window.print(), 300);
      return () => clearTimeout(timer);
    }
  }, [invoice, template]);

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
  };

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      <TemplatePreview
        config={template.config}
        branding={branding}
        mode={paperSizeToPreviewMode(template.config.paper.size)}
        data={invoiceToPreviewData(invoice, settings.date_format, settings.decimal_precision)}
      />
    </div>
  );
}
