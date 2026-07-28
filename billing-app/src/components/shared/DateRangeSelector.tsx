import { useState } from 'react';
import { CalendarRange, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ALL_PRESETS, PRESET_LABELS, resolveDateRangePreset, type DateRange, type DateRangePreset } from '@/lib/date-range';

interface DateRangeSelectorProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  timezone: string;
  presets?: DateRangePreset[];
  className?: string;
}

export function DateRangeSelector({ value, onChange, timezone, presets = ALL_PRESETS, className }: DateRangeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [draftPreset, setDraftPreset] = useState<DateRangePreset>(value.preset);
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);

  const isCustom = draftPreset === 'custom_date' || draftPreset === 'custom_range';
  const isValid = draftPreset === 'custom_date' ? !!draftFrom : !!draftFrom && !!draftTo && draftTo >= draftFrom;

  function openPopover(next: boolean) {
    if (next) {
      setDraftPreset(value.preset);
      setDraftFrom(value.from);
      setDraftTo(value.to);
    }
    setOpen(next);
  }

  function selectPreset(preset: DateRangePreset) {
    if (preset === 'custom_date' || preset === 'custom_range') {
      setDraftPreset(preset);
      return;
    }
    onChange(resolveDateRangePreset(preset, timezone));
    setOpen(false);
  }

  function applyCustom() {
    if (!isValid) return;
    const custom = draftPreset === 'custom_date' ? { from: draftFrom, to: draftFrom } : { from: draftFrom, to: draftTo };
    onChange(resolveDateRangePreset(draftPreset, timezone, custom));
    setOpen(false);
  }

  function resetCustom() {
    const today = resolveDateRangePreset('today', timezone);
    setDraftFrom(today.from);
    setDraftTo(today.from);
  }

  return (
    <Popover open={open} onOpenChange={openPopover}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className={cn('gap-1.5', className)}>
            <CalendarRange className="size-4" />
            <Badge variant="secondary" className="pointer-events-none">
              {value.label}
            </Badge>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex">
          <div className="flex flex-col gap-0.5 border-r p-1.5">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => selectPreset(preset)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors hover:bg-muted',
                  (preset === value.preset || (isCustom && preset === draftPreset)) && 'bg-muted font-medium',
                )}
              >
                {PRESET_LABELS[preset]}
              </button>
            ))}
          </div>
          {isCustom && (
            <div className="flex w-56 flex-col gap-2.5 p-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Start Date</Label>
                <Input type="date" value={draftFrom} max={draftTo || undefined} onChange={(e) => setDraftFrom(e.target.value)} />
              </div>
              {draftPreset === 'custom_range' && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">End Date</Label>
                  <Input type="date" value={draftTo} min={draftFrom || undefined} onChange={(e) => setDraftTo(e.target.value)} />
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={resetCustom}>
                  Reset
                </Button>
                <Button size="sm" className="flex-1" disabled={!isValid} onClick={applyCustom}>
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
