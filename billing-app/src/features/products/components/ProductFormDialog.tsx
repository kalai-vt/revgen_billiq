import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/features/categories/hooks/useCategories';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { hasFeature } from '@/features/plans/lib/planConfig';
import { useProductConfig } from '@/features/settings/hooks/useProductConfig';
import * as productsApi from '@/features/products/api';
import { IDENTIFIER_TYPES, IDENTIFIER_TYPE_LABELS } from '@/features/products/api';
import type { DuplicateCheckResult, IdentifierItem, IdentifierType, Product, ProductPayload } from '@/features/products/api';
import { ApiError } from '@/lib/api-client';

function emptyForm(defaultIdentifierType: IdentifierType = 'pid'): ProductPayload {
  return {
    name: '',
    identifier_type: defaultIdentifierType,
    identifier_label: '',
    identifier_value: '',
    barcode: '',
    category_id: '',
    description: '',
    cost_price: 0,
    selling_price: 0,
    tax_rate_percent: 0,
    additional_identifiers: [],
  };
}

function identifierValueLabel(type: IdentifierType, customLabel: string | null | undefined): string {
  if (type === 'custom') return customLabel?.trim() || 'Custom identifier';
  return IDENTIFIER_TYPE_LABELS[type];
}

interface ProductFormDialogProps {
  product?: Product;
  trigger: ReactElement;
}

export function ProductFormDialog({ product, trigger }: ProductFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductPayload>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const isEdit = !!product;
  const { data: categoriesData } = useCategories();
  const { plan } = useAuth();
  const { data: productConfig } = useProductConfig();
  const canUseBarcode = hasFeature(plan, 'barcode_support');
  const canUseMultipleIdentifiers = productConfig?.enable_multiple_identifiers ?? false;

  useEffect(() => {
    if (open) {
      setForm(
        product
          ? {
              name: product.name,
              identifier_type: product.identifier_type,
              identifier_label: product.identifier_label ?? '',
              identifier_value: product.identifier_value,
              barcode: product.barcode ?? '',
              category_id: product.category_id ?? '',
              description: product.description ?? '',
              cost_price: product.cost_price,
              selling_price: product.selling_price,
              tax_rate_percent: product.tax_rate_percent,
              additional_identifiers: product.additional_identifiers,
            }
          : emptyForm(productConfig?.default_identifier_type ?? 'pid'),
      );
      setError(null);
      setDuplicateCheck(null);
      setNameWarningDismissed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload: ProductPayload = {
        ...form,
        category_id: form.category_id || null,
        identifier_label: form.identifier_type === 'custom' ? form.identifier_label || null : null,
      };
      if (!canUseMultipleIdentifiers) {
        delete payload.additional_identifiers;
      }
      // Only include barcode in the request when the user can actually edit it —
      // otherwise re-sending the unchanged value on every save would needlessly
      // re-trigger the barcode_support plan gate for tenants that had one set
      // before downgrading.
      if (canUseBarcode) {
        payload.barcode = form.barcode || null;
      } else {
        delete payload.barcode;
      }
      return isEdit ? productsApi.updateProduct(product!.id, payload) : productsApi.createProduct(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Product updated' : 'Product created');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setOpen(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const generateBarcodeMutation = useMutation({
    mutationFn: () => productsApi.generateBarcode(),
    onSuccess: ({ barcode }) => setForm((prev) => ({ ...prev, barcode })),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not generate a barcode'),
  });

  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckResult | null>(null);
  const [nameWarningDismissed, setNameWarningDismissed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const hasAnyValue = form.name.trim() || form.identifier_value.trim() || (form.barcode ?? '').trim();
    if (!hasAnyValue) {
      setDuplicateCheck(null);
      return;
    }
    const timer = setTimeout(() => {
      productsApi
        .checkDuplicate({
          name: form.name.trim() || undefined,
          identifier_value: form.identifier_value.trim() || undefined,
          barcode: (form.barcode ?? '').trim() || undefined,
          exclude_id: product?.id,
        })
        .then((result) => {
          setDuplicateCheck(result);
          setNameWarningDismissed(false);
        })
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [open, form.name, form.identifier_value, form.barcode, product?.id]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  function updateAdditionalIdentifier(index: number, patch: Partial<IdentifierItem>) {
    setForm((prev) => ({
      ...prev,
      additional_identifiers: (prev.additional_identifiers ?? []).map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function addIdentifierRow() {
    setForm((prev) => ({
      ...prev,
      additional_identifiers: [...(prev.additional_identifiers ?? []), { identifier_type: 'sku', identifier_value: '' }],
    }));
  }

  function removeIdentifierRow(index: number) {
    setForm((prev) => ({
      ...prev,
      additional_identifiers: (prev.additional_identifiers ?? []).filter((_, i) => i !== index),
    }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit product' : 'New product'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Name</Label>
            <Input
              id="p-name"
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            {duplicateCheck?.name_match && !nameWarningDismissed && (
              <div className="flex items-start justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                <span>A product named &quot;{duplicateCheck.name_match.name}&quot; already exists. You can still save.</span>
                <button
                  type="button"
                  className="shrink-0 font-medium underline"
                  onClick={() => setNameWarningDismissed(true)}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-identifier-type">Identifier Type</Label>
              <Select
                value={form.identifier_type}
                onValueChange={(value) => setForm((prev) => ({ ...prev, identifier_type: value as IdentifierType }))}
              >
                <SelectTrigger id="p-identifier-type" className="w-full">
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
            <div className="space-y-1.5">
              <Label htmlFor="p-identifier-value">{identifierValueLabel(form.identifier_type, form.identifier_label)}</Label>
              <Input
                id="p-identifier-value"
                required
                value={form.identifier_value}
                onChange={(e) => setForm((prev) => ({ ...prev, identifier_value: e.target.value }))}
              />
              {duplicateCheck?.identifier_match && (
                <p className="text-xs text-destructive">
                  Already used by &quot;{duplicateCheck.identifier_match.name}&quot;.
                </p>
              )}
            </div>
          </div>
          {form.identifier_type === 'custom' && (
            <div className="space-y-1.5">
              <Label htmlFor="p-identifier-label">Label</Label>
              <Input
                id="p-identifier-label"
                required
                placeholder="e.g. Menu Code, Medicine Code, Style Code"
                value={form.identifier_label ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, identifier_label: e.target.value }))}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-category">Category</Label>
              <Select
                value={form.category_id || 'none'}
                onValueChange={(value) => setForm((prev) => ({ ...prev, category_id: value === 'none' ? '' : value }))}
              >
                <SelectTrigger id="p-category" className="w-full">
                  <SelectValue>
                    {(value: string | null) =>
                      !value || value === 'none'
                        ? 'No category'
                        : (categoriesData?.items.find((c) => c.id === value)?.name ?? 'No category')
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categoriesData?.items.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-barcode">Barcode</Label>
              <div className="flex gap-1.5">
                <Input
                  id="p-barcode"
                  disabled={!canUseBarcode}
                  placeholder={canUseBarcode ? undefined : 'Explore plan+'}
                  value={form.barcode ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, barcode: e.target.value }))}
                />
                {canUseBarcode && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={generateBarcodeMutation.isPending}
                    onClick={() => generateBarcodeMutation.mutate()}
                  >
                    {generateBarcodeMutation.isPending ? '…' : 'Generate'}
                  </Button>
                )}
              </div>
              {duplicateCheck?.barcode_match && (
                <p className="text-xs text-destructive">
                  Already used by &quot;{duplicateCheck.barcode_match.name}&quot;.
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-cost">Cost price</Label>
              <NumericInput
                id="p-cost"
                min={0}
                value={form.cost_price}
                onChange={(value) => setForm((prev) => ({ ...prev, cost_price: value ?? 0 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-price">Selling price</Label>
              <NumericInput
                id="p-price"
                required
                min={0}
                value={form.selling_price}
                onChange={(value) => setForm((prev) => ({ ...prev, selling_price: value ?? 0 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-tax">Tax %</Label>
              <NumericInput
                id="p-tax"
                min={0}
                max={100}
                value={form.tax_rate_percent}
                onChange={(value) => setForm((prev) => ({ ...prev, tax_rate_percent: value ?? 0 }))}
              />
            </div>
          </div>

          {canUseMultipleIdentifiers && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Additional identifiers</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={addIdentifierRow}>
                  <Plus className="size-3" /> Add identifier
                </Button>
              </div>
              {(form.additional_identifiers ?? []).map((item, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Select
                    value={item.identifier_type}
                    onValueChange={(value) => updateAdditionalIdentifier(index, { identifier_type: value as IdentifierType })}
                  >
                    <SelectTrigger className="w-36 shrink-0">
                      <SelectValue>{(value: string | null) => IDENTIFIER_TYPE_LABELS[(value as IdentifierType) ?? 'sku']}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {IDENTIFIER_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {IDENTIFIER_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {item.identifier_type === 'custom' && (
                    <Input
                      placeholder="Label"
                      className="w-24 shrink-0"
                      value={item.identifier_label ?? ''}
                      onChange={(e) => updateAdditionalIdentifier(index, { identifier_label: e.target.value })}
                    />
                  )}
                  <Input
                    placeholder="Value"
                    value={item.identifier_value}
                    onChange={(e) => updateAdditionalIdentifier(index, { identifier_value: e.target.value })}
                  />
                  <IconButton
                    type="button"
                    tooltip="Remove Identifier"
                    className="size-8 shrink-0 text-muted-foreground"
                    aria-label={`Remove ${IDENTIFIER_TYPE_LABELS[item.identifier_type]} identifier`}
                    onClick={() => removeIdentifierRow(index)}
                  >
                    <X className="size-4" />
                  </IconButton>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
