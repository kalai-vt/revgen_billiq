import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as settingsApi from '@/features/settings/api';
import * as invoiceDesignerApi from '@/features/invoice-designer/api';
import { VISIBLE_DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentType, type InvoiceTemplate, type InvoiceTemplateConfig } from '@/features/invoice-designer/api';
import { BrandingPanel } from '@/features/invoice-designer/components/panels/BrandingPanel';
import { HeaderLayoutPanel } from '@/features/invoice-designer/components/panels/HeaderLayoutPanel';
import { InvoiceInfoPanel } from '@/features/invoice-designer/components/panels/InvoiceInfoPanel';
import { CustomerDetailsPanel } from '@/features/invoice-designer/components/panels/CustomerDetailsPanel';
import { ItemTablePanel } from '@/features/invoice-designer/components/panels/ItemTablePanel';
import { TaxSummaryPanel } from '@/features/invoice-designer/components/panels/TaxSummaryPanel';
import { FooterPanel } from '@/features/invoice-designer/components/panels/FooterPanel';
import { QrBarcodePanel } from '@/features/invoice-designer/components/panels/QrBarcodePanel';
import { ThemePanel } from '@/features/invoice-designer/components/panels/ThemePanel';
import { PaperSizePanel } from '@/features/invoice-designer/components/panels/PaperSizePanel';
import { TemplatePreview, PREVIEW_MODES, type PreviewMode, type BrandingValues } from '@/features/invoice-designer/components/TemplatePreview';
import { buildSamplePreviewData } from '@/features/invoice-designer/lib/sampleData';
import { ApiError } from '@/lib/api-client';

const CONFIG_TABS: { id: string; label: string; Panel: (props: { config: InvoiceTemplateConfig; onChange: (updater: (c: InvoiceTemplateConfig) => InvoiceTemplateConfig) => void }) => JSX.Element }[] = [
  { id: 'branding', label: 'Branding', Panel: BrandingPanel },
  { id: 'header', label: 'Header', Panel: HeaderLayoutPanel },
  { id: 'invoice-info', label: 'Invoice Info', Panel: InvoiceInfoPanel },
  { id: 'customer', label: 'Customer', Panel: CustomerDetailsPanel },
  { id: 'items', label: 'Item Table', Panel: ItemTablePanel },
  { id: 'tax', label: 'Tax & Summary', Panel: TaxSummaryPanel },
  { id: 'footer', label: 'Footer', Panel: FooterPanel },
  { id: 'qr', label: 'QR & Barcode', Panel: QrBarcodePanel },
  { id: 'theme', label: 'Theme', Panel: ThemePanel },
  { id: 'paper', label: 'Paper & Printing', Panel: PaperSizePanel },
];

export function InvoiceDesignerPage() {
  const { tenant } = useAuth();
  const queryClient = useQueryClient();
  const [documentType, setDocumentType] = useState<DocumentType>('tax_invoice');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftConfig, setDraftConfig] = useState<InvoiceTemplateConfig | null>(null);
  const [draftName, setDraftName] = useState('');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });

  // Ensures every document type has at least its built-in default template lazily seeded
  // before the per-type list below is fetched, so a tenant who has never opened the designer
  // still sees a template immediately instead of an empty state.
  const { data: seeded } = useQuery({
    queryKey: ['invoice-templates-defaults'],
    queryFn: () => invoiceDesignerApi.getDefaultTemplates(),
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ['invoice-templates', documentType],
    queryFn: () => invoiceDesignerApi.listTemplates(documentType),
    enabled: !!seeded,
  });

  const selected = useMemo(() => templates?.find((t) => t.id === selectedId) ?? null, [templates, selectedId]);

  useEffect(() => {
    if (!templates || templates.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!templates.some((t) => t.id === selectedId)) {
      const preferred = templates.find((t) => t.is_default) ?? templates[0];
      setSelectedId(preferred.id);
    }
  }, [templates, selectedId]);

  useEffect(() => {
    if (selected) {
      setDraftConfig(selected.config);
      setDraftName(selected.name);
    }
  }, [selected]);

  const isDirty =
    !!selected && !!draftConfig && (JSON.stringify(draftConfig) !== JSON.stringify(selected.config) || draftName !== selected.name);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selected || !draftConfig) throw new Error('Nothing to save');
      return invoiceDesignerApi.updateTemplate(selected.id, { name: draftName, config: draftConfig });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-templates', documentType] });
      toast.success('Template saved');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to save template'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      invoiceDesignerApi.createTemplate({
        document_type: documentType,
        name: `${DOCUMENT_TYPE_LABELS[documentType]} ${(templates?.length ?? 0) + 1}`,
      }),
    onSuccess: (created: InvoiceTemplate) => {
      // Seed the cache directly (rather than just invalidating) so the newly created template
      // is present in `templates` in the same render where `selectedId` switches to it —
      // otherwise the auto-select effect below sees a stale list without it and reverts the
      // selection back to the previous template before the refetch lands.
      queryClient.setQueryData<InvoiceTemplate[]>(['invoice-templates', documentType], (old) =>
        old ? [...old, created] : [created],
      );
      setSelectedId(created.id);
      toast.success('Template created');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to create template'),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Nothing to duplicate');
      return invoiceDesignerApi.duplicateTemplate(selected.id);
    },
    onSuccess: (copy: InvoiceTemplate) => {
      queryClient.setQueryData<InvoiceTemplate[]>(['invoice-templates', documentType], (old) =>
        old ? [...old, copy] : [copy],
      );
      setSelectedId(copy.id);
      toast.success('Template duplicated — you can now customize the copy');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to duplicate template'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Nothing to delete');
      return invoiceDesignerApi.deleteTemplate(selected.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-templates', documentType] });
      setSelectedId(null);
      toast.success('Template deleted');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to delete template'),
  });

  const setDefaultMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Nothing selected');
      return invoiceDesignerApi.setDefaultTemplate(selected.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-templates', documentType] });
      toast.success('Set as the default template for this document type');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to set default'),
  });

  const branding: BrandingValues = {
    company_name: tenant?.company_name ?? '',
    phone: tenant?.phone ?? null,
    email: tenant?.email ?? null,
    logo_url: settings?.logo_url ?? null,
    gst_number: settings?.gst_number ?? null,
    tagline: settings?.tagline ?? null,
    address_line1: settings?.address_line1 ?? null,
    address_line2: settings?.address_line2 ?? null,
    city: settings?.city ?? null,
    state: settings?.state ?? null,
    pincode: settings?.pincode ?? null,
    website: settings?.website ?? null,
    pan_number: settings?.pan_number ?? null,
    fssai_number: settings?.fssai_number ?? null,
    drug_license_number: settings?.drug_license_number ?? null,
    msme_udyam_number: settings?.msme_udyam_number ?? null,
    social_links: settings?.social_links ?? null,
    feedback_url: settings?.feedback_url ?? null,
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoice Designer</h1>
        <p className="text-sm text-muted-foreground">Customize branding, layout, fields, and paper size — no code required.</p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[200px_1fr_1.15fr]">
        <aside className="min-h-0 space-y-3 overflow-y-auto rounded-xl border p-3">
          <div className="space-y-1.5">
            <Label>Document type</Label>
            <Select value={documentType} onValueChange={(v) => setDocumentType(v as DocumentType)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VISIBLE_DOCUMENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button size="sm" variant="outline" className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            + New template
          </Button>

          <div className="space-y-1">
            {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
            {templates?.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedId(template.id)}
                className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted ${
                  template.id === selectedId ? 'border-primary bg-primary/5 font-medium' : ''
                }`}
              >
                <span className="block truncate">{template.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {template.is_default ? 'Default' : ''}{template.is_default && template.is_builtin ? ' · ' : ''}{template.is_builtin ? 'Built-in' : ''}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto rounded-xl border p-4">
          {selected && draftConfig ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  disabled={selected.is_builtin}
                  className="max-w-xs"
                />
                {!selected.is_default && (
                  <Button size="sm" variant="outline" onClick={() => setDefaultMutation.mutate()} disabled={setDefaultMutation.isPending}>
                    Set as default
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending}>
                  Duplicate
                </Button>
                {!selected.is_builtin && (
                  <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                    Delete
                  </Button>
                )}
                <div className="ml-auto">
                  {selected.is_builtin ? (
                    <p className="text-xs text-muted-foreground">Built-in template — duplicate it to customize.</p>
                  ) : (
                    <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!isDirty || saveMutation.isPending}>
                      {saveMutation.isPending ? 'Saving…' : 'Save changes'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Vertical section nav: with 10 sections, a horizontal tab bar wraps onto
                  multiple rows but the tab list's height stays fixed to one row, so wrapped
                  rows visually overlap the panel content below. A vertical list has no such
                  height constraint — it simply grows, so this layout can never overlap. */}
              <Tabs defaultValue="branding" orientation="vertical" className="items-start">
                <TabsList className="h-fit w-40 shrink-0 flex-col items-stretch gap-0.5 bg-transparent p-0">
                  {CONFIG_TABS.map((tab) => (
                    <TabsTrigger key={tab.id} value={tab.id} className="px-2.5 py-1.5 text-left">
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {CONFIG_TABS.map(({ id, Panel }) => (
                  <TabsContent key={id} value={id} className="min-w-0 flex-1 border-l pl-5">
                    <fieldset disabled={selected.is_builtin} className="disabled:opacity-60">
                      <Panel config={draftConfig} onChange={(updater) => setDraftConfig((prev) => (prev ? updater(prev) : prev))} />
                    </fieldset>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          ) : !seeded || isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <p className="text-sm text-muted-foreground">No template yet — create one to get started.</p>
          )}
        </section>

        <section className="min-h-0 space-y-3 overflow-y-auto rounded-xl border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Live preview</p>
            <Select value={previewMode} onValueChange={(v) => setPreviewMode(v as PreviewMode)}>
              <SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PREVIEW_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto pb-4">
            {draftConfig && (
              <TemplatePreview
                config={draftConfig}
                branding={branding}
                mode={previewMode}
                data={buildSamplePreviewData(documentType)}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
