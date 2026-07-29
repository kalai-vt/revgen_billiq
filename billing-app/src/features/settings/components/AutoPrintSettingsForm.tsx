import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import * as settingsApi from '@/features/settings/api';
import type { AutoPrintPaperSize } from '@/features/settings/api';
import { useTemplateForDocument } from '@/features/invoice-designer/hooks';
import * as qzTray from '@/lib/printing/qzTray';
import { ApiError } from '@/lib/api-client';

const PAPER_SIZE_LABELS: Record<AutoPrintPaperSize, string> = {
  '58mm': '58mm Thermal',
  '80mm': '80mm Thermal',
  A5: 'A5',
  A4: 'A4',
  letter: 'Letter',
  legal: 'Legal',
};

type QzStatus = 'idle' | 'checking' | 'connected' | 'unavailable';

export function AutoPrintSettingsForm() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });
  const { template: taxInvoiceTemplate } = useTemplateForDocument('tax_invoice');

  const [form, setForm] = useState({
    auto_print_after_checkout: false,
    auto_print_printer_name: null as string | null,
    auto_print_paper_size: '80mm' as AutoPrintPaperSize,
  });
  const [error, setError] = useState<string | null>(null);
  const [qzStatus, setQzStatus] = useState<QzStatus>('idle');
  const [printers, setPrinters] = useState<string[]>([]);

  useEffect(() => {
    if (settings) {
      setForm({
        auto_print_after_checkout: settings.auto_print_after_checkout,
        auto_print_printer_name: settings.auto_print_printer_name,
        auto_print_paper_size: settings.auto_print_paper_size,
      });
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateSettings(form),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      toast.success('Automatic printing settings updated');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  async function detectPrinters() {
    setQzStatus('checking');
    try {
      const found = await qzTray.listPrinters();
      setPrinters(found);
      setQzStatus('connected');
      if (found.length === 0) toast.info('QZ Tray is connected but reported no printers.');
    } catch (err) {
      setQzStatus('unavailable');
      toast.error(err instanceof Error ? err.message : 'Could not connect to QZ Tray');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-9 w-full max-w-sm" />
          </div>
        ))}
      </div>
    );
  }

  const sizeMismatch = taxInvoiceTemplate && taxInvoiceTemplate.config.paper.size !== form.auto_print_paper_size;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          id="auto_print_after_checkout"
          type="checkbox"
          className="size-4 rounded border-input"
          checked={form.auto_print_after_checkout}
          onChange={(e) => setForm((prev) => ({ ...prev, auto_print_after_checkout: e.target.checked }))}
        />
        <Label htmlFor="auto_print_after_checkout" className="text-sm font-normal">
          Automatically print the receipt after checkout, with no print dialog
        </Label>
      </div>

      <div className="rounded-md border p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Printer (via QZ Tray)</p>
            <p className="text-xs text-muted-foreground">
              Works with USB, network (LAN/WiFi), and Bluetooth printers. First, install/pair the
              printer with this computer's operating system as you normally would (Windows
              Settings → Printers, or your Bluetooth pairing dialog) — that's a one-time step for
              the printer itself, not the app. Then install the free{' '}
              <a
                href="https://qz.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                QZ Tray
              </a>{' '}
              helper once on this till so the browser can send print jobs silently, with no
              dialog. Detect below to pick it up.
            </p>
          </div>
          {qzStatus === 'connected' && <Badge variant="secondary">Connected</Badge>}
          {qzStatus === 'unavailable' && <Badge variant="destructive">Not detected</Badge>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Default printer</Label>
            <div className="flex gap-2">
              <Select
                value={form.auto_print_printer_name ?? ''}
                onValueChange={(v) => setForm((prev) => ({ ...prev, auto_print_printer_name: v || null }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {() => form.auto_print_printer_name || 'No printer selected'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {printers.length === 0 && form.auto_print_printer_name && (
                    <SelectItem value={form.auto_print_printer_name}>{form.auto_print_printer_name}</SelectItem>
                  )}
                  {printers.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={detectPrinters}
                disabled={qzStatus === 'checking'}
                title="Detect printers via QZ Tray"
              >
                {qzStatus === 'checking' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Default paper size</Label>
            <Select
              value={form.auto_print_paper_size}
              onValueChange={(v) => setForm((prev) => ({ ...prev, auto_print_paper_size: v as AutoPrintPaperSize }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{(value: string | null) => PAPER_SIZE_LABELS[(value as AutoPrintPaperSize) ?? '80mm']}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAPER_SIZE_LABELS) as AutoPrintPaperSize[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {PAPER_SIZE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          58mm and 80mm print a compact ESC/POS receipt sized for thermal paper (with auto-cut) —
          the fast, reliable format commodity thermal printers expect, regardless of whether
          they're on USB, LAN/WiFi, or Bluetooth. A5, A4, Letter, and Legal instead print the full
          Tax Invoice template from{' '}
          <span className="font-medium">Invoice Designer</span> to a regular printer. Set this to
          match the printer's physical paper so the two stay in sync.
        </p>
        {sizeMismatch && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Heads up: your Tax Invoice template in Invoice Designer is set to{' '}
            {taxInvoiceTemplate!.config.paper.size}, but this printer's default paper size is set to{' '}
            {form.auto_print_paper_size}. Update one of them for a consistent print.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
