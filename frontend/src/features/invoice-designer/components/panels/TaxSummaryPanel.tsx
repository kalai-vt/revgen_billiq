import { FieldToggle } from '@/features/invoice-designer/components/FieldToggle';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';

const FIELDS: { key: keyof PanelProps['config']['tax_summary']['fields']; label: string }[] = [
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'discount', label: 'Discount' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'igst', label: 'IGST' },
  { key: 'cess', label: 'CESS' },
  { key: 'round_off', label: 'Round Off' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'packing', label: 'Packing Charges' },
  { key: 'grand_total', label: 'Grand Total' },
  { key: 'paid', label: 'Paid Amount' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'balance', label: 'Balance' },
  { key: 'amount_in_words', label: 'Amount in Words' },
];

export function TaxSummaryPanel({ config, onChange }: PanelProps) {
  const fields = config.tax_summary.fields;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {FIELDS.map(({ key, label }) => (
        <FieldToggle
          key={key}
          id={`taxsum-${key}`}
          label={label}
          checked={fields[key]}
          onChange={(value) =>
            onChange((cfg) => ({
              ...cfg,
              tax_summary: { fields: { ...cfg.tax_summary.fields, [key]: value } },
            }))
          }
        />
      ))}
    </div>
  );
}
