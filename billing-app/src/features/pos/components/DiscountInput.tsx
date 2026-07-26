import { NumericInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DiscountType } from '@/features/pos/api';

interface DiscountInputProps {
  discountType: DiscountType;
  discountValue: number;
  onChange: (type: DiscountType, value: number) => void;
}

export function DiscountInput({ discountType, discountValue, onChange }: DiscountInputProps) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={discountType ?? 'none'}
        onValueChange={(value) => onChange(value === 'none' ? null : (value as DiscountType), discountValue)}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Discount">
            {(value: string | null) =>
              value === 'percent' ? 'Percent %' : value === 'flat' ? 'Flat amount' : 'No discount'
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No discount</SelectItem>
          <SelectItem value="percent">Percent %</SelectItem>
          <SelectItem value="flat">Flat amount</SelectItem>
        </SelectContent>
      </Select>
      <NumericInput
        min={0}
        max={discountType === 'percent' ? 100 : undefined}
        disabled={!discountType}
        placeholder="0"
        className="w-24"
        value={discountType ? discountValue : 0}
        onChange={(value) => onChange(discountType, value ?? 0)}
      />
    </div>
  );
}
