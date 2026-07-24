import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

interface DateRangeSelectProps {
  days: number;
  onChange: (days: number) => void;
}

export function DateRangeSelect({ days, onChange }: DateRangeSelectProps) {
  return (
    <Select value={String(days)} onValueChange={(value) => onChange(Number(value))}>
      <SelectTrigger className="w-40">
        <SelectValue>
          {(value: string | null) => OPTIONS.find((o) => o.value === value)?.label ?? 'Select range'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
