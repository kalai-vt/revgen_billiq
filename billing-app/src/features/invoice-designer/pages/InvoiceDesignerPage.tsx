import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as settingsApi from '@/features/settings/api';
import * as invoiceDesignerApi from '@/features/invoice-designer/api';
import type { DocumentType, InvoiceTemplateConfig } from '@/features/invoice-designer/api';
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
import { TemplatePreview, type PreviewMode, type BrandingValues } from '@/features/invoice-designer/components/TemplatePreview';
import { TemplateToolbar, type AutosaveStatus } from '@/features/invoice-designer/components/TemplateToolbar';
import { PreviewControls, ZOOM_DEFAULT } from '@/features/invoice-designer/components/PreviewControls';
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

const AUTOSAVE_DEBOUNCE_MS = 1500;

export function InvoiceDesignerPage() {
  const { tenant } = useAuth();
  const queryClient = useQueryClient();
  const [documentType, setDocumentType] = useState<DocumentType>('tax_invoice');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftConfig, setDraftConfig] = useState<InvoiceTemplateConfig | null>(null);
  const [draftName, setDraftName] = useState('');
  const [activeTab, setActiveTab] = useState('branding');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop');
  const [previewZoom, setPreviewZoom] = useState(ZOOM_DEFAULT);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configPanelRef = useRef<HTMLDivElement | null>(null);

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
  const loadingInitial = !seeded || isLoading;

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
  const canSave = isDirty && !!selected && !selected.is_builtin;

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selected || !draftConfig) throw new Error('Nothing to save');
      return invoiceDesignerApi.updateTemplate(selected.id, { name: draftName, config: draftConfig });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-templates', documentType] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to save template'),
  });

  function saveNow() {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (canSave) saveMutation.mutate();
  }

  // Debounced autosave: every draft edit resets the timer, so a save only actually fires once
  // the user pauses for a moment — matches the explicit "Save changes" button remaining as a
  // manual "save right now" escape hatch rather than the only way to persist.
  useEffect(() => {
    if (!canSave) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveMutation.mutate();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // Only the draft content should reset the debounce timer — re-running this on every
    // saveMutation identity change would fight the timer it itself schedules.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftConfig, draftName, canSave]);

  // Ctrl/Cmd+S saves immediately, bypassing the autosave debounce.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveNow();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSave, selected, draftConfig, draftName]);

  // Warn before leaving the tab/window with unsaved edits still pending (autosave hasn't caught
  // up yet, or the save itself failed).
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const autosaveStatus: AutosaveStatus = saveMutation.isPending
    ? 'saving'
    : saveMutation.isError
      ? 'error'
      : isDirty
        ? 'unsaved'
        : selected && draftConfig
          ? 'saved'
          : 'idle';

  const createMutation = useMutation({
    mutationFn: () =>
      invoiceDesignerApi.createTemplate({
        document_type: documentType,
        name: `${invoiceDesignerApi.DOCUMENT_TYPE_LABELS[documentType]} ${(templates?.length ?? 0) + 1}`,
      }),
    onSuccess: (created) => {
      // Seed the cache directly (rather than just invalidating) so the newly created template
      // is present in `templates` in the same render where `selectedId` switches to it —
      // otherwise the auto-select effect below sees a stale list without it and reverts the
      // selection back to the previous template before the refetch lands.
      queryClient.setQueryData<invoiceDesignerApi.InvoiceTemplate[]>(['invoice-templates', documentType], (old) =>
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
    onSuccess: (copy) => {
      queryClient.setQueryData<invoiceDesignerApi.InvoiceTemplate[]>(['invoice-templates', documentType], (old) =>
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
    <div className="flex flex-col gap-4 xl:h-full xl:min-h-0">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoice Designer</h1>
        <p className="text-sm text-muted-foreground">Customize branding, layout, fields, and paper size — no code required.</p>
      </div>

      {loadingInitial ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : (
        <TemplateToolbar
          documentType={documentType}
          onDocumentTypeChange={setDocumentType}
          templates={templates}
          selected={selected}
          selectedId={selectedId}
          onSelectTemplate={setSelectedId}
          draftName={draftName}
          onDraftNameChange={setDraftName}
          autosaveStatus={autosaveStatus}
          onSaveNow={saveNow}
          isSaving={saveMutation.isPending}
          canSave={canSave}
          onCreate={() => createMutation.mutate()}
          isCreating={createMutation.isPending}
          onDuplicate={() => duplicateMutation.mutate()}
          isDuplicating={duplicateMutation.isPending}
          onDelete={() => deleteMutation.mutate()}
          isDeleting={deleteMutation.isPending}
          onSetDefault={() => setDefaultMutation.mutate()}
          isSettingDefault={setDefaultMutation.isPending}
        />
      )}

      {loadingInitial ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr] xl:min-h-0 xl:flex-1">
          <Skeleton className="h-64 rounded-xl" />
          <div className="grid grid-cols-1 gap-4 xl:min-h-0 xl:grid-cols-[1fr_1.15fr]">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        </div>
      ) : selected && draftConfig ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr] xl:min-h-0 xl:flex-1">
          <Tabs value={activeTab} onValueChange={setActiveTab} orientation="vertical" className="contents">
            {/* At `xl` (the true 3/4-column desktop layout), the config/preview panels below
                scroll independently within a fixed-height row, so this nav is never scrolled
                out of view on its own there — no `position: sticky` needed. Below `xl`, nothing
                here forces a height/scroll constraint; the page grows to its natural content
                height and the app shell's own `<main>` (AppShell.tsx) scrolls it, same as any
                other page — the `min-h-0`/`overflow-y-auto` below are XL-only for exactly this
                reason: applying them unconditionally previously caused the stacked/tablet layout
                to squeeze columns to equal shrunk heights and overlap. */}
            <aside className="self-start rounded-xl border p-3 xl:min-h-0">
              <TabsList className="h-fit w-full shrink-0 flex-col items-stretch gap-0.5 bg-transparent p-0">
                {CONFIG_TABS.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} className="px-2.5 py-1.5 text-left">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </aside>

            <div className="grid grid-cols-1 gap-4 xl:min-h-0 xl:grid-cols-[1fr_1.15fr]">
              <section ref={configPanelRef} className="rounded-xl border p-4 xl:min-h-0 xl:overflow-y-auto">
                <fieldset disabled={selected.is_builtin} className="disabled:opacity-60">
                  {CONFIG_TABS.map(({ id, Panel }) => (
                    <TabsContent key={id} value={id}>
                      <Panel config={draftConfig} onChange={(updater) => setDraftConfig((prev) => (prev ? updater(prev) : prev))} />
                    </TabsContent>
                  ))}
                </fieldset>
              </section>

              <section className="space-y-3 rounded-xl border bg-muted/30 p-4 xl:min-h-0 xl:overflow-y-auto">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Live preview</p>
                  <PreviewControls
                    mode={previewMode}
                    onModeChange={setPreviewMode}
                    zoom={previewZoom}
                    onZoomChange={setPreviewZoom}
                    onRefresh={() => setPreviewRefreshKey((k) => k + 1)}
                  />
                </div>
                <div className="overflow-x-auto pb-4" style={{ transform: `scale(${previewZoom / 100})`, transformOrigin: 'top center' }}>
                  <TemplatePreview
                    key={previewRefreshKey}
                    config={draftConfig}
                    branding={branding}
                    mode={previewMode}
                    data={buildSamplePreviewData(documentType)}
                  />
                </div>
              </section>
            </div>
          </Tabs>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No template yet — create one to get started.</p>
      )}
    </div>
  );
}
