import { useQuery } from '@tanstack/react-query';
import * as invoiceDesignerApi from '@/features/invoice-designer/api';
import type { DocumentType, InvoiceTemplate } from '@/features/invoice-designer/api';

/** Resolves the tenant's default template for a document type (print pages/receipts use the
 * default; selecting a specific non-default template at billing time is a later phase). */
export function useTemplateForDocument(documentType: DocumentType): {
  template: InvoiceTemplate | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoice-templates-defaults'],
    queryFn: () => invoiceDesignerApi.getDefaultTemplates(),
    retry: false,
  });
  return { template: data?.[documentType], isLoading, error };
}
