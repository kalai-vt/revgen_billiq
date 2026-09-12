import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldToggle } from '@/features/invoice-designer/components/FieldToggle';
import { QrImageUpload } from '@/features/invoice-designer/components/QrImageUpload';
import type {
  PaymentQrPosition,
  PaymentQrSize,
  PaymentQrVisibility,
} from '@/features/invoice-designer/api';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';
import * as settingsApi from '@/features/settings/api';

function OptionRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const POSITION_OPTIONS: { value: PaymentQrPosition; label: string }[] = [
  { value: 'header', label: 'Header' },
  { value: 'footer', label: 'Footer' },
  { value: 'payment_section', label: 'Payment section' },
];
const SIZE_OPTIONS: { value: PaymentQrSize; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
];
const VISIBILITY_OPTIONS: { value: PaymentQrVisibility; label: string }[] = [
  { value: 'unpaid_only', label: 'Only when payment is due' },
  { value: 'always', label: 'Always' },
  { value: 'never', label: 'Never' },
];

export function PaymentQrPanel({ config, onChange }: PanelProps) {
  const qr = config.payment_qr;
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });
  // The QR is only ever rendered when a merchant VPA exists — a `upi://pay` link with no payee
  // cannot be paid — so say so here rather than letting a tenant switch it on and wonder why
  // nothing prints.
  const hasUpiId = Boolean(settings?.upi_vpa);

  return (
    <div className="space-y-4">
      <FieldToggle
        id="payment-qr-enabled"
        label="Show Payment QR Code"
        checked={qr.enabled}
        onChange={(value) => onChange((cfg) => ({ ...cfg, payment_qr: { ...cfg.payment_qr, enabled: value } }))}
      />

      {qr.enabled && !hasUpiId && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900 dark:bg-amber-950">
          Add your UPI ID in <span className="font-medium">Settings → Billing Settings</span> first. Without it
          there's no payee to pay, so the QR is left off the invoice rather than printed unpayable.
        </p>
      )}

      {qr.enabled && (
        <>
          {/* Offered here as well as on the QR & Barcode panel, because this is the panel a tenant
              is already in when they are setting the Payment QR up. Both write the same value, so
              they cannot disagree. A restaurant with a UPI QR already printed on the counter wants
              that exact code on the bill. */}
          <div className="space-y-1.5">
            <Label>Your own QR image</Label>
            <p className="text-xs text-muted-foreground">
              Optional. Upload the UPI QR you already use and it replaces the generated one. A fixed image
              can&apos;t carry the amount due, so the customer types it in themselves.
            </p>
            <QrImageUpload
              kind="payment_qr"
              url={config.qr_barcode.custom_images?.payment_qr}
              onChange={(url) =>
                onChange((cfg) => {
                  const next = { ...(cfg.qr_barcode.custom_images ?? {}) };
                  if (url) next.payment_qr = url;
                  else delete next.payment_qr;
                  return { ...cfg, qr_barcode: { ...cfg.qr_barcode, custom_images: next } };
                })
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-qr-label">Label</Label>
            <Input
              id="payment-qr-label"
              value={qr.label}
              maxLength={60}
              placeholder="Scan to Pay"
              onChange={(e) =>
                onChange((cfg) => ({ ...cfg, payment_qr: { ...cfg.payment_qr, label: e.target.value } }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <OptionRow
              label="Position"
              value={qr.position}
              options={POSITION_OPTIONS}
              onChange={(value) =>
                onChange((cfg) => ({ ...cfg, payment_qr: { ...cfg.payment_qr, position: value } }))
              }
            />
            <OptionRow
              label="Size"
              value={qr.size}
              options={SIZE_OPTIONS}
              onChange={(value) => onChange((cfg) => ({ ...cfg, payment_qr: { ...cfg.payment_qr, size: value } }))}
            />
          </div>

          <div className="space-y-1.5">
            <OptionRow
              label="Show QR"
              value={qr.visibility}
              options={VISIBILITY_OPTIONS}
              onChange={(value) =>
                onChange((cfg) => ({ ...cfg, payment_qr: { ...cfg.payment_qr, visibility: value } }))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              A scannable QR on a fully-paid bill invites a second payment, so it's hidden once nothing is
              outstanding.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <FieldToggle
                id="payment-qr-amount"
                label="Show amount"
                checked={qr.show_amount}
                onChange={(value) =>
                  onChange((cfg) => ({ ...cfg, payment_qr: { ...cfg.payment_qr, show_amount: value } }))
                }
              />
              <p className="mt-1 pl-1 text-[11px] text-muted-foreground">
                Encodes the exact amount due. Off makes it a static QR the customer types the amount into.
              </p>
            </div>
            <div>
              <FieldToggle
                id="payment-qr-upi-id"
                label="Show UPI ID"
                checked={qr.show_upi_id}
                onChange={(value) =>
                  onChange((cfg) => ({ ...cfg, payment_qr: { ...cfg.payment_qr, show_upi_id: value } }))
                }
              />
              <p className="mt-1 pl-1 text-[11px] text-muted-foreground">
                Prints the UPI ID under the QR for customers who prefer to pay by typing it.
              </p>
            </div>
            <div>
              <FieldToggle
                id="payment-qr-status"
                label="Show payment status"
                checked={qr.show_payment_status}
                onChange={(value) =>
                  onChange((cfg) => ({ ...cfg, payment_qr: { ...cfg.payment_qr, show_payment_status: value } }))
                }
              />
              <p className="mt-1 pl-1 text-[11px] text-muted-foreground">
                Adds Paid, or the outstanding amount, beside the QR.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
