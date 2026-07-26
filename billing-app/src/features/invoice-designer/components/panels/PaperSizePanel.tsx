import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldToggle } from '@/features/invoice-designer/components/FieldToggle';
import type { LogoSizePreset, Orientation, PaperSize } from '@/features/invoice-designer/api';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';

const SIZES: { value: PaperSize; label: string }[] = [
  { value: '58mm', label: '58mm Thermal' },
  { value: '80mm', label: '80mm Thermal' },
  { value: 'A5', label: 'A5' },
  { value: 'A4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
  { value: 'legal', label: 'Legal' },
  { value: 'custom', label: 'Custom Size' },
];

export function PaperSizePanel({ config, onChange }: PanelProps) {
  const paper = config.paper;

  function set<K extends keyof typeof paper>(key: K, value: (typeof paper)[K]) {
    onChange((cfg) => ({ ...cfg, paper: { ...cfg.paper, [key]: value } }));
  }

  function setMargin(side: keyof typeof paper.margin_mm, value: number) {
    onChange((cfg) => ({ ...cfg, paper: { ...cfg.paper, margin_mm: { ...cfg.paper.margin_mm, [side]: value } } }));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Paper size</Label>
          <Select value={paper.size} onValueChange={(v) => set('size', v as PaperSize)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SIZES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Orientation</Label>
          <Select value={paper.orientation} onValueChange={(v) => set('orientation', v as Orientation)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="portrait">Portrait</SelectItem>
              <SelectItem value="landscape">Landscape</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {paper.size === 'custom' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Width (mm)</Label>
            <Input
              type="number"
              value={paper.custom_width_mm ?? ''}
              onChange={(e) => set('custom_width_mm', e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Height (mm)</Label>
            <Input
              type="number"
              value={paper.custom_height_mm ?? ''}
              onChange={(e) => set('custom_height_mm', e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Margins (mm)</Label>
        <div className="grid grid-cols-4 gap-2">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <div key={side} className="space-y-1">
              <Label className="text-[11px] font-normal capitalize text-muted-foreground">{side}</Label>
              <Input
                type="number"
                value={paper.margin_mm[side]}
                onChange={(e) => setMargin(side, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Logo size</Label>
          <Select value={paper.logo_size_preset} onValueChange={(v) => set('logo_size_preset', v as LogoSizePreset)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Font scale ({paper.font_scale_percent}%)</Label>
          <input
            type="range"
            min={50}
            max={200}
            value={paper.font_scale_percent}
            onChange={(e) => set('font_scale_percent', Number(e.target.value))}
            className="mt-2 w-full"
          />
        </div>
      </div>

      <FieldToggle
        id="paper-autofit"
        label="Auto-fit content to paper width"
        checked={paper.auto_fit}
        onChange={(v) => set('auto_fit', v)}
      />
    </div>
  );
}
