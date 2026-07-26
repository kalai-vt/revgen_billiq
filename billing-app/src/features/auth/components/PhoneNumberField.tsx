import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INDIA_COUNTRY_CODE } from '@/features/auth/lib/phone';
import type { PhoneType } from '@/features/auth/api';

interface PhoneNumberFieldProps {
  id: string;
  number: string;
  onNumberChange: (value: string) => void;
  phoneType: PhoneType;
  onPhoneTypeChange: (value: PhoneType) => void;
  disabled?: boolean;
  required?: boolean;
}

export function PhoneNumberField({
  id,
  number,
  onNumberChange,
  phoneType,
  onPhoneTypeChange,
  disabled,
  required,
}: PhoneNumberFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Phone</Label>
      <div className="flex gap-2">
        <div className="flex items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
          {INDIA_COUNTRY_CODE}
        </div>
        <Input
          id={id}
          inputMode="numeric"
          placeholder="9876543210"
          maxLength={12}
          required={required}
          disabled={disabled}
          value={number}
          onChange={(e) => onNumberChange(e.target.value.replace(/[^\d]/g, ''))}
        />
        <Select
          value={phoneType}
          onValueChange={(value) => onPhoneTypeChange(value as PhoneType)}
          disabled={disabled}
        >
          <SelectTrigger className="w-32 shrink-0">
            <SelectValue>{(value: string | null) => (value === 'landline' ? 'Landline' : 'Mobile')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mobile">Mobile</SelectItem>
            <SelectItem value="landline">Landline</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
