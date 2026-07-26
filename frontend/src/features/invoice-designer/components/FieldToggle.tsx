import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface FieldToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function FieldToggle({ id, label, checked, onChange }: FieldToggleProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <Label htmlFor={id} className="cursor-pointer font-normal">
        {label}
      </Label>
    </div>
  );
}
