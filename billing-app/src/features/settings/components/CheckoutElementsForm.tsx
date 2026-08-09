import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import * as settingsApi from '@/features/settings/api';
import type { CheckoutConfig } from '@/features/settings/api';
import { ApiError } from '@/lib/api-client';

/** Fully data-driven from the backend catalog (app/core/checkout_elements.py) — adding a future
 * element there (Coupon, Loyalty, Gift Card, ...) shows up here automatically, no frontend change
 * needed for this form. Total and Checkout are never in the catalog: they're mandatory and always
 * visible on the Billing page, so there's nothing to toggle for them. */
export function CheckoutElementsForm() {
  const queryClient = useQueryClient();
  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ['checkout-elements-catalog'],
    queryFn: settingsApi.getCheckoutElementCatalog,
    staleTime: Infinity,
  });
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['checkout-config'],
    queryFn: settingsApi.getCheckoutConfig,
  });

  const [form, setForm] = useState<CheckoutConfig>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (configData) setForm(configData.config);
  }, [configData]);

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateCheckoutConfig(form),
    onSuccess: (result) => {
      queryClient.setQueryData(['checkout-config'], result);
      toast.success('Checkout elements updated');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  const isLoading = catalogLoading || configLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full max-w-sm" />
        ))}
      </div>
    );
  }

  const groups = catalog?.groups ?? {};
  const elements = catalog?.elements ?? [];
  const elementsByGroup = elements.reduce<Record<string, typeof elements>>((acc, el) => {
    (acc[el.group] ??= []).push(el);
    return acc;
  }, {});

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Total</span> and{' '}
        <span className="font-medium text-foreground">Checkout</span> are always shown on the Billing page and can't
        be turned off.
      </div>

      {Object.entries(groups).map(([groupKey, groupLabel]) => {
        const groupElements = elementsByGroup[groupKey] ?? [];
        if (groupElements.length === 0) return null;
        return (
          <div key={groupKey} className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{groupLabel}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {groupElements.map((el) => (
                <div key={el.key} className="flex items-center gap-2 rounded-md border p-2.5">
                  <input
                    id={`checkout-element-${el.key}`}
                    type="checkbox"
                    className="size-4 shrink-0 rounded border-input"
                    checked={form[el.key] ?? true}
                    onChange={(e) => setForm((prev) => ({ ...prev, [el.key]: e.target.checked }))}
                  />
                  <Label htmlFor={`checkout-element-${el.key}`} className="flex-1 text-sm font-normal">
                    {el.label}
                  </Label>
                  {el.depends_on_module && (
                    <span className="text-[11px] text-muted-foreground">Needs Outstanding</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
