import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as settingsApi from '@/features/settings/api';
import { TemplatePreview, paperSizeToPreviewMode, type BrandingValues } from '@/features/invoice-designer/components/TemplatePreview';
import { useTemplateForDocument } from '@/features/invoice-designer/hooks';
import { consumeProvisionalBillSnapshot, provisionalBillToPreviewData, type ProvisionalBillSnapshot } from '@/features/pos/lib/provisionalBill';
import { getPromotionConfig } from '@/features/invoice-designer/api';

/** Opened via window.open() from POSPage's "Print Order Bill" button, reading a cart snapshot
 * left in localStorage rather than fetching anything by ID — there is no invoice, no order, no
 * server-side record behind this page at all. Mirrors InvoicePrintPage's layout/print-trigger
 * exactly so the two feel like the same feature, just fed from different data sources. */
export function ProvisionalBillPrintPage() {
  const { tenant } = useAuth();
  const [snapshot] = useState<ProvisionalBillSnapshot | null>(() => consumeProvisionalBillSnapshot());
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });
  const { template, isLoading: isTemplateLoading } = useTemplateForDocument('tax_invoice');
  const { data: promotionContent } = useQuery({ queryKey: ['promotion-config'], queryFn: getPromotionConfig });

  useEffect(() => {
    if (snapshot && template && settings) {
      const timer = setTimeout(() => window.print(), 300);
      return () => clearTimeout(timer);
    }
  }, [snapshot, template, settings]);

  if (!snapshot) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        No order bill data found for this tab. Close it and click "Print Order Bill" again from the Billing page.
      </div>
    );
  }

  if (isTemplateLoading || !template || !settings) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
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
        data={provisionalBillToPreviewData(snapshot, settings.date_format, settings.decimal_precision)}
        promotionContent={promotionContent ?? null}
      />
    </div>
  );
}
