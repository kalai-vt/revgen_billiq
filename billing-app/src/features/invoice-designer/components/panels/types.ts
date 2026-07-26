import type { InvoiceTemplateConfig } from '@/features/invoice-designer/api';

export interface PanelProps {
  config: InvoiceTemplateConfig;
  onChange: (updater: (config: InvoiceTemplateConfig) => InvoiceTemplateConfig) => void;
}

export function updateAt<T extends object>(obj: T, patch: Partial<T>): T {
  return { ...obj, ...patch };
}
