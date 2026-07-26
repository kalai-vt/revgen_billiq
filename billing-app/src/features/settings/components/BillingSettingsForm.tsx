import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import * as settingsApi from '@/features/settings/api';
import type { ThemeChoice } from '@/features/settings/api';
import { LogoUploadControl } from '@/features/settings/components/LogoUploadControl';
import { ApiError } from '@/lib/api-client';

const THEME_LABELS: Record<ThemeChoice, string> = { light: 'Light', dark: 'Dark', system: 'System' };

export function BillingSettingsForm() {
  const { setTheme } = useTheme();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });

  const [form, setForm] = useState<settingsApi.SettingsUpdatePayload>({
    gst_number: '',
    invoice_prefix: 'INV',
    currency: 'INR',
    theme: 'light',
    allow_manager_price_override: false,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        gst_number: settings.gst_number ?? '',
        invoice_prefix: settings.invoice_prefix,
        currency: settings.currency,
        theme: settings.theme,
        allow_manager_price_override: settings.allow_manager_price_override,
      });
      setTheme(settings.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const mutation = useMutation({
    mutationFn: () =>
      settingsApi.updateSettings({
        ...form,
        gst_number: form.gst_number || null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      toast.success('Billing settings updated');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleThemeChange(value: ThemeChoice) {
    setForm((prev) => ({ ...prev, theme: value }));
    setTheme(value);
  }

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
        <Label htmlFor="gst-number">GST number</Label>
        <Input
          id="gst-number"
          value={form.gst_number ?? ''}
          onChange={(e) => setForm((prev) => ({ ...prev, gst_number: e.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invoice-prefix">Invoice prefix</Label>
        <Input
          id="invoice-prefix"
          value={form.invoice_prefix ?? ''}
          onChange={(e) => setForm((prev) => ({ ...prev, invoice_prefix: e.target.value.toUpperCase() }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="settings-currency">Currency</Label>
        <Input
          id="settings-currency"
          value={form.currency ?? ''}
          onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
        />
      </div>
      <LogoUploadControl logoUrl={settings?.logo_url} />
      <div className="space-y-1.5">
        <Label>Theme</Label>
        <Select value={form.theme ?? 'light'} onValueChange={(value) => handleThemeChange(value as ThemeChoice)}>
          <SelectTrigger className="w-full">
            <SelectValue>{(value: string | null) => THEME_LABELS[(value as ThemeChoice) ?? 'light']}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <input
          id="allow-manager-price-override"
          type="checkbox"
          className="size-4 rounded border-input"
          checked={form.allow_manager_price_override ?? false}
          onChange={(e) => setForm((prev) => ({ ...prev, allow_manager_price_override: e.target.checked }))}
        />
        <Label htmlFor="allow-manager-price-override" className="text-sm font-normal">
          Allow managers to override prices during billing
        </Label>
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
