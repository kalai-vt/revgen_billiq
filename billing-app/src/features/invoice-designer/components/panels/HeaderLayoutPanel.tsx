import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ColorPickerField } from '@/features/invoice-designer/components/ColorPickerField';
import { FieldToggle } from '@/features/invoice-designer/components/FieldToggle';
import type { HeaderLayout, HeaderHeight } from '@/features/invoice-designer/api';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';
import { cn } from '@/lib/utils';

const LAYOUTS: { value: HeaderLayout; label: string }[] = [
  { value: 'logo-left', label: 'Logo Left' },
  { value: 'logo-center', label: 'Logo Center' },
  { value: 'logo-right', label: 'Logo Right' },
  { value: 'banner', label: 'Full Width Banner' },
  { value: 'minimal', label: 'Minimal Header' },
  { value: 'modern-card', label: 'Modern Card Style' },
];

const HEIGHTS: { value: HeaderHeight; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'tall', label: 'Tall' },
];

export function HeaderLayoutPanel({ config, onChange }: PanelProps) {
  const header = config.header;

  function set<K extends keyof typeof header>(key: K, value: (typeof header)[K]) {
    onChange((cfg) => ({ ...cfg, header: { ...cfg.header, [key]: value } }));
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Layout</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LAYOUTS.map((layout) => (
            <button
              key={layout.value}
              type="button"
              onClick={() => set('layout', layout.value)}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-muted',
                header.layout === layout.value && 'border-primary bg-primary/5 font-medium',
              )}
            >
              {layout.label}
            </button>
          ))}
        </div>
      </div>

      <ColorPickerField
        label="Header background color"
        value={header.background_color ?? '#ffffff'}
        onChange={(value) => set('background_color', value)}
      />
      {header.background_color && (
        <Button variant="ghost" size="sm" onClick={() => set('background_color', null)}>
          Clear background color
        </Button>
      )}

      <div className="space-y-1.5">
        <Label>Header height</Label>
        <Select value={header.height_preset} onValueChange={(value) => set('height_preset', value as HeaderHeight)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {HEIGHTS.map((h) => (
              <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Corner rounding ({header.border_radius}px)</Label>
        <input
          type="range"
          min={0}
          max={24}
          value={header.border_radius}
          onChange={(e) => set('border_radius', Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <FieldToggle id="h-border" label="Header border" checked={header.show_border} onChange={(v) => set('show_border', v)} />
        <FieldToggle id="h-divider" label="Header divider" checked={header.show_divider} onChange={(v) => set('show_divider', v)} />
      </div>
    </div>
  );
}
