import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import * as settingsApi from '@/features/settings/api';
import type { PrimarySearchField } from '@/features/settings/api';
import { IDENTIFIER_TYPES, IDENTIFIER_TYPE_LABELS } from '@/features/products/api';
import type { IdentifierType } from '@/features/products/api';
import { ApiError } from '@/lib/api-client';

const SEARCH_FIELD_LABELS: Record<PrimarySearchField, string> = {
  name: 'Product Name',
  identifier_value: 'Identifier Value',
  barcode: 'Barcode',
  category: 'Category',
};

const SEARCH_FIELDS: PrimarySearchField[] = ['name', 'identifier_value', 'barcode', 'category'];

export function ProductConfigurationForm() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });

  const [form, setForm] = useState({
    primary_search_field: 'identifier_value' as PrimarySearchField,
    default_identifier_type: 'pid' as IdentifierType,
    enable_multiple_identifiers: false,
    require_unique_identifier: true,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        primary_search_field: settings.primary_search_field,
        default_identifier_type: settings.default_identifier_type,
        enable_multiple_identifiers: settings.enable_multiple_identifiers,
        require_unique_identifier: settings.require_unique_identifier,
      });
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateSettings(form),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['product-config'] });
      toast.success('Product configuration updated');
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
        <Label htmlFor="primary-search-field">Primary product search field</Label>
        <Select
          value={form.primary_search_field}
          onValueChange={(value) => setForm((prev) => ({ ...prev, primary_search_field: value as PrimarySearchField }))}
        >
          <SelectTrigger id="primary-search-field" className="w-full">
            <SelectValue>{(value: string | null) => SEARCH_FIELD_LABELS[(value as PrimarySearchField) ?? 'identifier_value']}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SEARCH_FIELDS.map((field) => (
              <SelectItem key={field} value={field}>
                {SEARCH_FIELD_LABELS[field]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="default-identifier-type">Default identifier type</Label>
        <Select
          value={form.default_identifier_type}
          onValueChange={(value) => setForm((prev) => ({ ...prev, default_identifier_type: value as IdentifierType }))}
        >
          <SelectTrigger id="default-identifier-type" className="w-full">
            <SelectValue>{(value: string | null) => IDENTIFIER_TYPE_LABELS[(value as IdentifierType) ?? 'pid']}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {IDENTIFIER_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {IDENTIFIER_TYPE_LABELS[type]}
                {type === 'pid' ? ' (Recommended)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="enable-multiple-identifiers"
          type="checkbox"
          className="size-4 rounded border-input"
          checked={form.enable_multiple_identifiers}
          onChange={(e) => setForm((prev) => ({ ...prev, enable_multiple_identifiers: e.target.checked }))}
        />
        <Label htmlFor="enable-multiple-identifiers" className="text-sm font-normal">
          Enable multiple identifiers per product
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="require-unique-identifier"
          type="checkbox"
          className="size-4 rounded border-input"
          checked={form.require_unique_identifier}
          onChange={(e) => setForm((prev) => ({ ...prev, require_unique_identifier: e.target.checked }))}
        />
        <Label htmlFor="require-unique-identifier" className="text-sm font-normal">
          Require unique identifier
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
