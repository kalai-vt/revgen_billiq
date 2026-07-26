import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

interface ColorPickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorPickerField({ label, value, onChange }: ColorPickerFieldProps) {
  const safeValue = HEX_PATTERN.test(value) ? value : '#000000';

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger
            className="size-8 shrink-0 rounded-lg border border-input"
            style={{ backgroundColor: safeValue }}
            aria-label={`Pick ${label.toLowerCase()}`}
          />
          <PopoverContent className="w-auto p-2">
            <input
              type="color"
              value={safeValue}
              onChange={(e) => onChange(e.target.value)}
              className="size-32 cursor-pointer border-0 bg-transparent p-0"
            />
          </PopoverContent>
        </Popover>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="font-mono uppercase"
          maxLength={7}
        />
      </div>
    </div>
  );
}
