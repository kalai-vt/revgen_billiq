import { FieldToggle } from '@/features/invoice-designer/components/FieldToggle';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';

const FIELDS: { key: keyof PanelProps['config']['invoice_info']['fields']; label: string }[] = [
  { key: 'invoice_number', label: 'Invoice Number' },
  { key: 'date', label: 'Invoice Date' },
  { key: 'time', label: 'Invoice Time' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'counter', label: 'Counter' },
  { key: 'order_number', label: 'Order Number' },
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'payment_method', label: 'Payment Method' },
  { key: 'payment_status', label: 'Payment Status' },
  { key: 'invoice_status', label: 'Invoice Status' },
];

export function InvoiceInfoPanel({ config, onChange }: PanelProps) {
  const fields = config.invoice_info.fields;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {FIELDS.map(({ key, label }) => (
        <FieldToggle
          key={key}
          id={`invinfo-${key}`}
          label={label}
          checked={fields[key]}
          onChange={(value) =>
            onChange((cfg) => ({
              ...cfg,
              invoice_info: { fields: { ...cfg.invoice_info.fields, [key]: value } },
            }))
          }
        />
      ))}
    </div>
  );
}
