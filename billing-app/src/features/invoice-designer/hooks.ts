import { useQuery } from '@tanstack/react-query';
import * as invoiceDesignerApi from '@/features/invoice-designer/api';
import type { DocumentType, InvoiceTemplate } from '@/features/invoice-designer/api';

/** Resolves the tenant's default template for a document type (print pages/receipts use the
 * default; selecting a specific non-default template at billing time is a later phase). */
export function useTemplateForDocument(documentType: DocumentType): {
  template: InvoiceTemplate | undefined;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ['invoice-templates-defaults'],
    queryFn: () => invoiceDesignerApi.getDefaultTemplates(),
  });
  return { template: data?.[documentType], isLoading };
}
