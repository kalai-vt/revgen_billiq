import { FieldToggle } from '@/features/invoice-designer/components/FieldToggle';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';

const FIELDS: { key: keyof PanelProps['config']['qr_barcode']; label: string; hint: string }[] = [
  { key: 'invoice_qr', label: 'Invoice QR', hint: 'Encodes invoice number and amount' },
  { key: 'payment_qr', label: 'Payment QR', hint: 'UPI-style payment QR' },
  { key: 'business_qr', label: 'Business QR', hint: 'Business contact card' },
  { key: 'website_qr', label: 'Website QR', hint: 'Links to your website' },
  { key: 'feedback_qr', label: 'Feedback QR', hint: 'Links to your feedback form' },
  { key: 'barcode', label: 'Barcode', hint: 'Invoice number as a barcode' },
];

export function QrBarcodePanel({ config, onChange }: PanelProps) {
  const qr = config.qr_barcode;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {FIELDS.map(({ key, label, hint }) => (
        <div key={key}>
          <FieldToggle
            id={`qr-${key}`}
            label={label}
            checked={qr[key]}
            onChange={(value) => onChange((cfg) => ({ ...cfg, qr_barcode: { ...cfg.qr_barcode, [key]: value } }))}
          />
          <p className="mt-1 pl-1 text-[11px] text-muted-foreground">{hint}</p>
        </div>
      ))}
    </div>
  );
}
