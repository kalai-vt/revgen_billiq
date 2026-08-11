import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldToggle } from '@/features/invoice-designer/components/FieldToggle';
import { getPromotionConfig } from '@/features/invoice-designer/api';
import type {
  ColumnAlign,
  FontSizeChoice,
  PromotionLayout,
  PromotionSpacing,
} from '@/features/invoice-designer/api';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';

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

const LAYOUT_OPTIONS: { value: PromotionLayout; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'standard', label: 'Standard' },
  { value: 'banner', label: 'Banner' },
];
const ALIGNMENT_OPTIONS: { value: ColumnAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];
const FONT_SIZE_OPTIONS: { value: FontSizeChoice; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
];
const SPACING_OPTIONS: { value: PromotionSpacing; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'relaxed', label: 'Relaxed' },
];

export function BillIQPromotionPanel({ config, onChange }: PanelProps) {
  const promo = config.billiq_promotion;
  const { data: content } = useQuery({ queryKey: ['promotion-config'], queryFn: getPromotionConfig });

  function set<K extends keyof typeof promo>(key: K, value: (typeof promo)[K]) {
    onChange((cfg) => ({ ...cfg, billiq_promotion: { ...cfg.billiq_promotion, [key]: value } }));
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Promote BillIQ on your customer's printed bills and generate new business leads.
      </p>

      <FieldToggle
        id="promo-enabled"
        label="Show BillIQ Promotion"
        checked={promo.enabled}
        onChange={(v) => set('enabled', v)}
      />

      {promo.enabled && (
        <>
          <div className="rounded-lg border bg-muted/20 p-2.5 text-xs">
            <p className="mb-1 font-medium text-muted-foreground">Content (managed by RevGenAI)</p>
            {content ? (
              <div className="space-y-0.5 text-muted-foreground">
                <p className="font-semibold text-foreground">{content.title}</p>
                <p>{content.description}</p>
                <p>{content.website} · {content.phone}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">Loading…</p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              This message is centrally managed by RevGenAI and can't be edited per business — only its
              position, size, and layout below are yours to configure.
            </p>
          </div>

          <OptionRow label="Layout" value={promo.layout} options={LAYOUT_OPTIONS} onChange={(v) => set('layout', v)} />
          <OptionRow
            label="Alignment"
            value={promo.alignment}
            options={ALIGNMENT_OPTIONS}
            onChange={(v) => set('alignment', v)}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <OptionRow
              label="Font Size"
              value={promo.font_size}
              options={FONT_SIZE_OPTIONS}
              onChange={(v) => set('font_size', v)}
            />
            <OptionRow
              label="Spacing"
              value={promo.spacing}
              options={SPACING_OPTIONS}
              onChange={(v) => set('spacing', v)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <FieldToggle
              id="promo-separator"
              label="Separator Line"
              checked={promo.separator_line}
              onChange={(v) => set('separator_line', v)}
            />
            <FieldToggle
              id="promo-qr"
              label="QR Code"
              checked={promo.qr_enabled}
              onChange={(v) => set('qr_enabled', v)}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">Position: Bottom of Invoice (fixed).</p>
        </>
      )}
    </div>
  );
}
