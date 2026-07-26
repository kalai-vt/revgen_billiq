import { FieldToggle } from '@/features/invoice-designer/components/FieldToggle';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';

const FIELDS: { key: keyof PanelProps['config']['customer_details']['fields']; label: string }[] = [
  { key: 'name', label: 'Customer Name' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Address' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'loyalty_number', label: 'Loyalty Number' },
  { key: 'membership', label: 'Membership' },
  { key: 'company_name', label: 'Company Name' },
];

export function CustomerDetailsPanel({ config, onChange }: PanelProps) {
  const fields = config.customer_details.fields;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {FIELDS.map(({ key, label }) => (
        <FieldToggle
          key={key}
          id={`custdetail-${key}`}
          label={label}
          checked={fields[key]}
          onChange={(value) =>
            onChange((cfg) => ({
              ...cfg,
              customer_details: { fields: { ...cfg.customer_details.fields, [key]: value } },
            }))
          }
        />
      ))}
    </div>
  );
}
