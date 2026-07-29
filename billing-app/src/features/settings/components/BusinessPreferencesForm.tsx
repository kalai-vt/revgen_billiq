import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import * as settingsApi from '@/features/settings/api';
import type { DefaultPaymentMethod } from '@/features/settings/api';
import { ApiError } from '@/lib/api-client';

const PAYMENT_METHOD_LABELS: Record<DefaultPaymentMethod, string> = { cash: 'Cash', card: 'Card', upi: 'UPI' };

export function BusinessPreferencesForm() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });

  const [form, setForm] = useState({
    default_tax_percent: 0,
    allow_discounts: true,
    enable_barcode: true,
    enable_customer_selection: false,
    allow_negative_stock: true,
    default_low_stock_threshold: 5,
    default_payment_method: 'cash' as DefaultPaymentMethod,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        default_tax_percent: settings.default_tax_percent,
        allow_discounts: settings.allow_discounts,
        enable_barcode: settings.enable_barcode,
        enable_customer_selection: settings.enable_customer_selection,
        allow_negative_stock: settings.allow_negative_stock,
        default_low_stock_threshold: settings.default_low_stock_threshold,
        default_payment_method: settings.default_payment_method,
      });
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateSettings(form),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      toast.success('Business preferences updated');
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

  function toggle(key: keyof typeof form, label: string) {
    return (
      <div className="flex items-center gap-2">
        <input
          id={key}
          type="checkbox"
          className="size-4 rounded border-input"
          checked={form[key] as boolean}
          onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.checked }))}
        />
        <Label htmlFor={key} className="text-sm font-normal">
          {label}
        </Label>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="default-tax-percent">Default tax %</Label>
        <NumericInput
          id="default-tax-percent"
          value={form.default_tax_percent}
          onChange={(value) => setForm((prev) => ({ ...prev, default_tax_percent: value ?? 0 }))}
          min={0}
          max={100}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="default-low-stock-threshold">Default low-stock threshold</Label>
        <NumericInput
          id="default-low-stock-threshold"
          value={form.default_low_stock_threshold}
          onChange={(value) => setForm((prev) => ({ ...prev, default_low_stock_threshold: value ?? 5 }))}
          min={0}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Default payment method</Label>
        <Select
          value={form.default_payment_method}
          onValueChange={(value) => setForm((prev) => ({ ...prev, default_payment_method: value as DefaultPaymentMethod }))}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue>
              {(value: string | null) => PAYMENT_METHOD_LABELS[(value as DefaultPaymentMethod) ?? 'cash']}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PAYMENT_METHOD_LABELS) as DefaultPaymentMethod[]).map((key) => (
              <SelectItem key={key} value={key}>
                {PAYMENT_METHOD_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 sm:col-span-2">
        {toggle('allow_discounts', 'Allow discounts during billing')}
        {toggle('enable_barcode', 'Enable barcode on products')}
        {toggle('enable_customer_selection', 'Allow selecting an existing customer at checkout')}
        {toggle('allow_negative_stock', 'Allow sales that would take stock below zero')}
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
