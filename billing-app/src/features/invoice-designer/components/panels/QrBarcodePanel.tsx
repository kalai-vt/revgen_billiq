import { FieldToggle } from '@/features/invoice-designer/components/FieldToggle';
import { QrImageUpload } from '@/features/invoice-designer/components/QrImageUpload';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';
import type { QrKind } from '@/features/invoice-designer/api';
import { paymentQrEnabled } from '@/lib/upi';

type Field = {
  key: keyof PanelProps['config']['qr_barcode'];
  label: string;
  hint: string;
  /** Types whose generated code is built per invoice. An uploaded image is fixed, so it cannot
   * carry the invoice number or the amount due — worth saying plainly rather than letting a
   * restaurant discover it on a printed bill. */
  dynamic?: string;
};

const FIELDS: Field[] = [
  {
    key: 'invoice_qr',
    label: 'Invoice QR',
    hint: 'Encodes invoice number and amount',
    dynamic: 'Your image is fixed, so it will not carry the invoice number or amount.',
  },
  {
    key: 'payment_qr',
    label: 'Payment QR',
    hint: 'UPI-style payment QR',
    dynamic: 'Your image is fixed, so the customer types the amount in themselves.',
  },
  { key: 'business_qr', label: 'Business QR', hint: 'Business contact card' },
  { key: 'website_qr', label: 'Website QR', hint: 'Links to your website' },
  { key: 'feedback_qr', label: 'Feedback QR', hint: 'Links to your feedback form' },
  { key: 'barcode', label: 'Barcode', hint: 'Invoice number as a barcode' },
];

export function QrBarcodePanel({ config, onChange }: PanelProps) {
  const qr = config.qr_barcode;
  const custom = qr.custom_images ?? {};

  function setCustomImage(kind: QrKind, url: string | null) {
    onChange((cfg) => {
      const next = { ...(cfg.qr_barcode.custom_images ?? {}) };
      if (url) next[kind] = url;
      else delete next[kind];
      return { ...cfg, qr_barcode: { ...cfg.qr_barcode, custom_images: next } };
    });
  }

  /** Whether this type will actually print, which is what decides if an upload is worth offering.
   *
   * The Payment QR has two switches — the checkbox here and the richer one on the Payment QR Code
   * panel — and either turns it on (see `paymentQrEnabled`). Checking only the checkbox hid the
   * upload from every tenant who had switched the element on from the other panel, which is most
   * of them, since that is where the label, size and visibility live. */
  function isOn(key: Field['key']): boolean {
    if (key === 'payment_qr') return paymentQrEnabled(qr.payment_qr, config.payment_qr.enabled);
    return qr[key] as boolean;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {FIELDS.map(({ key, label, hint, dynamic }) => (
        <div key={key}>
          <FieldToggle
            id={`qr-${key}`}
            label={label}
            checked={qr[key] as boolean}
            onChange={(value) => onChange((cfg) => ({ ...cfg, qr_barcode: { ...cfg.qr_barcode, [key]: value } }))}
          />
          <p className="mt-1 pl-1 text-[11px] text-muted-foreground">{hint}</p>
          {/* The barcode is generated from the invoice number — there is no static image to
              upload in its place, so it is the one row with no upload control. */}
          {key !== 'barcode' && isOn(key) && (
            <QrImageUpload
              kind={key as QrKind}
              url={custom[key as QrKind]}
              dynamic={dynamic}
              onChange={(url) => setCustomImage(key as QrKind, url)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
