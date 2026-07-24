import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';

interface TaxInputProps {
  value: number;
  onChange: (value: number) => void;
}

export function TaxInput({ value, onChange }: TaxInputProps) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="tax-percentage" className="text-sm text-muted-foreground">
        Tax %
      </Label>
      <NumericInput
        id="tax-percentage"
        min={0}
        max={100}
        className="w-24"
        value={value}
        onChange={(next) => onChange(next ?? 0)}
      />
    </div>
  );
}
