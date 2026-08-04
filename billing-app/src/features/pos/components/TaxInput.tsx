import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';

interface TaxInputProps {
  value: number;
  onChange: (value: number) => void;
}

export function TaxInput({ value, onChange }: TaxInputProps) {
  return (
    <>
      <Label htmlFor="tax-percentage" className="text-xs text-muted-foreground">
        Tax %
      </Label>
      <NumericInput
        id="tax-percentage"
        min={0}
        max={100}
        className="w-full text-xs"
        value={value}
        onChange={(next) => onChange(next ?? 0)}
      />
    </>
  );
}
