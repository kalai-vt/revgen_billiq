import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import * as settingsApi from '@/features/settings/api';
import type { DateFormat } from '@/features/settings/api';
import { ApiError } from '@/lib/api-client';

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  'DD/MM/YYYY': 'DD/MM/YYYY',
  'MM/DD/YYYY': 'MM/DD/YYYY',
  'YYYY-MM-DD': 'YYYY-MM-DD',
};

export function InvoiceSettingsForm() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });

  const [form, setForm] = useState({
    starting_invoice_number: 1,
    receipt_footer: '',
    decimal_precision: 2,
    date_format: 'DD/MM/YYYY' as DateFormat,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        starting_invoice_number: settings.starting_invoice_number,
        receipt_footer: settings.receipt_footer ?? '',
        decimal_precision: settings.decimal_precision,
        date_format: settings.date_format,
      });
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: () =>
      settingsApi.updateSettings({
        ...form,
        receipt_footer: form.receipt_footer || null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      toast.success('Invoice settings updated');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-9 w-full max-w-sm" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="starting-invoice-number">Starting invoice number</Label>
        <NumericInput
          id="starting-invoice-number"
          value={form.starting_invoice_number}
          onChange={(value) => setForm((prev) => ({ ...prev, starting_invoice_number: value ?? 1 }))}
          min={1}
          allowDecimal={false}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="decimal-precision">Decimal precision</Label>
        <NumericInput
          id="decimal-precision"
          value={form.decimal_precision}
          onChange={(value) => setForm((prev) => ({ ...prev, decimal_precision: value ?? 2 }))}
          min={0}
          max={4}
          allowDecimal={false}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Date format</Label>
        <Select
          value={form.date_format}
          onValueChange={(value) => setForm((prev) => ({ ...prev, date_format: value as DateFormat }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue>{(value: string | null) => DATE_FORMAT_LABELS[(value as DateFormat) ?? 'DD/MM/YYYY']}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((key) => (
              <SelectItem key={key} value={key}>
                {DATE_FORMAT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="receipt-footer">Receipt footer</Label>
        <Input
          id="receipt-footer"
          placeholder="e.g. Thank you for shopping with us!"
          value={form.receipt_footer}
          onChange={(e) => setForm((prev) => ({ ...prev, receipt_footer: e.target.value }))}
        />
      </div>

      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
