import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImageUp, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldToggle } from '@/features/invoice-designer/components/FieldToggle';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';
import { uploadQrImage, type QrKind } from '@/features/invoice-designer/api';
import { apiErrorMessage } from '@/lib/query-error';

const ACCEPT = 'image/png,image/jpeg,image/webp';

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

/** The upload half of one QR type: shows the tenant's own image when they have one, otherwise
 * offers to take one. Only rendered for a type that is switched on — uploading an image for a QR
 * that will not print is a way to waste someone's afternoon. */
function QrImageUpload({
  kind,
  url,
  dynamic,
  onChange,
}: {
  kind: QrKind;
  url: string | undefined;
  dynamic?: string;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url: uploaded } = await uploadQrImage(kind, file);
      onChange(uploaded);
      toast.success('QR image uploaded — save the template to use it');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not upload that image'));
    } finally {
      setBusy(false);
      // Clearing lets the same file be picked again after a failure.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="mt-1.5 pl-1">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {url ? (
        <div className="flex items-center gap-2">
          <img
            src={url}
            alt={`Your ${kind.replace(/_/g, ' ')}`}
            className="size-10 shrink-0 rounded border bg-white object-contain p-0.5"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11px] font-medium">Your own QR</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="text-[11px] underline-offset-2 hover:underline"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                Replace
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[11px] text-destructive underline-offset-2 hover:underline"
                disabled={busy}
                onClick={() => onChange(null)}
              >
                <X className="size-3" />
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <ImageUp className="size-3" />}
          Upload your QR
        </Button>
      )}
      {url && dynamic && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">{dynamic}</p>}
    </div>
  );
}

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
          {key !== 'barcode' && qr[key] && (
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
