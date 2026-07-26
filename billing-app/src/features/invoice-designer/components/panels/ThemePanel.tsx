import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ColorPickerField } from '@/features/invoice-designer/components/ColorPickerField';
import type {
  BorderStyleChoice,
  CornerRadiusChoice,
  DividerStyleChoice,
  FontFamily,
  FontSizeChoice,
  IconStyleChoice,
  TableStyleChoice,
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

export function ThemePanel({ config, onChange }: PanelProps) {
  const theme = config.theme;

  function set<K extends keyof typeof theme>(key: K, value: (typeof theme)[K]) {
    onChange((cfg) => ({ ...cfg, theme: { ...cfg.theme, [key]: value } }));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <ColorPickerField label="Primary color" value={theme.primary_color} onChange={(v) => set('primary_color', v)} />
        <ColorPickerField label="Secondary color" value={theme.secondary_color} onChange={(v) => set('secondary_color', v)} />
        <ColorPickerField label="Accent color" value={theme.accent_color} onChange={(v) => set('accent_color', v)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <OptionRow<FontFamily>
          label="Font family"
          value={theme.font_family}
          onChange={(v) => set('font_family', v)}
          options={[
            { value: 'sans', label: 'Sans-serif' },
            { value: 'serif', label: 'Serif' },
            { value: 'mono', label: 'Monospace' },
          ]}
        />
        <OptionRow<FontSizeChoice>
          label="Font size"
          value={theme.font_size}
          onChange={(v) => set('font_size', v)}
          options={[
            { value: 'sm', label: 'Small' },
            { value: 'md', label: 'Medium' },
            { value: 'lg', label: 'Large' },
          ]}
        />
        <OptionRow<BorderStyleChoice>
          label="Border style"
          value={theme.border_style}
          onChange={(v) => set('border_style', v)}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'dashed', label: 'Dashed' },
            { value: 'none', label: 'None' },
          ]}
        />
        <OptionRow<TableStyleChoice>
          label="Table style"
          value={theme.table_style}
          onChange={(v) => set('table_style', v)}
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'striped', label: 'Striped' },
            { value: 'minimal', label: 'Minimal' },
          ]}
        />
        <OptionRow<DividerStyleChoice>
          label="Divider style"
          value={theme.divider_style}
          onChange={(v) => set('divider_style', v)}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'dashed', label: 'Dashed' },
            { value: 'dotted', label: 'Dotted' },
          ]}
        />
        <OptionRow<CornerRadiusChoice>
          label="Corner radius"
          value={theme.corner_radius}
          onChange={(v) => set('corner_radius', v)}
          options={[
            { value: 'none', label: 'None' },
            { value: 'sm', label: 'Small' },
            { value: 'md', label: 'Medium' },
            { value: 'lg', label: 'Large' },
          ]}
        />
        <OptionRow<IconStyleChoice>
          label="Icon style"
          value={theme.icon_style}
          onChange={(v) => set('icon_style', v)}
          options={[
            { value: 'outline', label: 'Outline' },
            { value: 'filled', label: 'Filled' },
          ]}
        />
      </div>
    </div>
  );
}
