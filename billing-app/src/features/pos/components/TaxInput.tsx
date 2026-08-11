import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';

interface TaxInputProps {
  value: number;
  onChange: (value: number) => void;
}

export function TaxInput({ value, onChange }: TaxInputProps) {
  return (
    <>
      {/* Matches SelectTrigger's own chrome exactly (h-8, rounded-lg, border border-input,
       * bg-transparent) — Discount's label-equivalent cell is a real Select, which is
       * self-bordered; this plain label needs the same treatment applied explicitly so the two
       * rows read as visually identical, not just structurally identical. */}
      <Label
        htmlFor="tax-percentage"
        className="h-8 w-full justify-start rounded-lg border border-input bg-transparent px-2.5 text-xs font-normal text-muted-foreground"
      >
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
