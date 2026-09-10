import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChefHat, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import * as printerApi from '@/features/settings/printerApi';
import type { ConnectionType, PrinterConfiguration, TicketFields } from '@/features/settings/printerApi';
import { testKotPrint } from '@/features/restaurant/lib/kotPrint';
import { isBrowserReachable, printFailureMessage } from '@/lib/printing/printerManager';
import * as qzTray from '@/lib/printing/qzTray';
import { apiErrorMessage } from '@/lib/query-error';
import { cn } from '@/lib/utils';

const CONNECTION_TYPES: { value: ConnectionType; label: string; hint?: string }[] = [
  { value: 'usb', label: 'USB' },
  { value: 'bluetooth', label: 'Bluetooth' },
  { value: 'lan', label: 'LAN / Ethernet', hint: 'Needs the Print Agent' },
  { value: 'wifi', label: 'Wi-Fi', hint: 'Needs the Print Agent' },
];

const TICKET_FIELD_LABELS: { key: keyof TicketFields; label: string }[] = [
  { key: 'restaurant_name', label: 'Print restaurant name' },
  { key: 'table_number', label: 'Print table number' },
  { key: 'kot_number', label: 'Print KOT number' },
  { key: 'date_time', label: 'Print date & time' },
  { key: 'customer_name', label: 'Print customer name' },
  { key: 'order_notes', label: 'Print order notes' },
];

const STATUS_STYLES: Record<PrinterConfiguration['connection_status'], string> = {
  connected: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-destructive',
  untested: 'text-amber-600 dark:text-amber-400',
  unconfigured: 'text-muted-foreground',
};

const STATUS_LABELS: Record<PrinterConfiguration['connection_status'], string> = {
  connected: 'Connected',
  failed: 'Connection failed',
  untested: 'Not tested yet',
  unconfigured: 'Configuration required',
};

/** The kitchen printer, configured alongside — never instead of — the billing printer.
 *
 * The whole screen turns on one thing being honest: the status line only says Connected when a
 * test actually reached the printer. Everything that changes where the printer lives resets it,
 * because a stale "Connected" is worse than no status at all — staff stop checking.
 */
export function KotPrinterSettingsForm() {
  const queryClient = useQueryClient();
  // Unsaved edits are held as an overlay on the fetched configuration rather than copied into
  // state and re-synced by an effect: the copy has to be kept in step with every refetch, and
  // getting that wrong silently shows stale values in a form people are about to save.
  const [edits, setEdits] = useState<Partial<PrinterConfiguration>>({});
  const [testing, setTesting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['printer-config', 'kot'],
    queryFn: () => printerApi.getPrinterConfig('kot'),
  });

  const draft: PrinterConfiguration | null = data ? { ...data, ...edits } : null;

  const { data: printers } = useQuery({
    queryKey: ['qz-printers'],
    queryFn: qzTray.listPrinters,
    // Only meaningful for the USB path, and it prompts QZ Tray, so don't ask until it's relevant.
    enabled: draft?.connection_type === 'usb' && draft?.enabled === true,
    retry: false,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: (payload: printerApi.PrinterConfigurationUpdate) => printerApi.updatePrinterConfig('kot', payload),
    onSuccess: (updated) => {
      setEdits({});
      queryClient.setQueryData(['printer-config', 'kot'], updated);
      toast.success('Kitchen printer settings saved');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not save the kitchen printer settings')),
  });

  const recordTest = useMutation({
    mutationFn: (result: { ok: boolean; error?: string | null }) => printerApi.recordConnectionTest('kot', result),
    onSuccess: (updated) => {
      queryClient.setQueryData(['printer-config', 'kot'], updated);
    },
  });

  if (isLoading || !draft) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />
      </Card>
    );
  }

  const reachable = isBrowserReachable(draft.connection_type);

  function patch(changes: Partial<PrinterConfiguration>) {
    setEdits((current) => ({ ...current, ...changes }));
  }

  function handleSave() {
    save.mutate({
      enabled: draft!.enabled,
      printer_name: draft!.printer_name,
      connection_type: draft!.connection_type,
      ip_address: draft!.ip_address,
      port: draft!.port,
      bluetooth_device_id: draft!.bluetooth_device_id,
      paper_width: draft!.paper_width,
      copies: draft!.copies,
      auto_print: draft!.auto_print,
      ticket_fields: draft!.ticket_fields,
    });
  }

  /** Runs the test in the browser — the only side that can actually reach a USB or Bluetooth
   * printer — then records the real outcome. */
  async function runTest(withTicket: boolean) {
    setTesting(true);
    try {
      const saved = await printerApi.updatePrinterConfig('kot', {
        enabled: draft!.enabled,
        printer_name: draft!.printer_name,
        connection_type: draft!.connection_type,
        ip_address: draft!.ip_address,
        port: draft!.port,
        bluetooth_device_id: draft!.bluetooth_device_id,
        paper_width: draft!.paper_width,
        copies: withTicket ? draft!.copies : 1,
        auto_print: draft!.auto_print,
        ticket_fields: draft!.ticket_fields,
      });
      const outcome = await testKotPrint(saved);
      await recordTest.mutateAsync({
        ok: outcome.ok,
        error: outcome.ok ? null : printFailureMessage(outcome, 'kitchen printer'),
      });
      if (outcome.ok) toast.success(withTicket ? 'Test KOT sent to the kitchen printer' : 'Printer responded');
      else toast.error(printFailureMessage(outcome, 'kitchen printer'));
    } catch (err) {
      const message = apiErrorMessage(err, 'The printer test could not be run');
      await recordTest.mutateAsync({ ok: false, error: message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ChefHat className="size-4" />
            Kitchen / KOT Printer
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A separate printer at the kitchen pass. The billing printer above is unaffected.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border-input"
            checked={draft.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          Enable KOT printing
        </label>
      </div>

      {!draft.enabled ? (
        <p className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
          KOT printing is off. Tickets are still created and shown on the Kitchen KOT screen — only the paper copy
          is skipped.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Connection type</Label>
              <Select
                value={draft.connection_type}
                onValueChange={(value) => patch({ connection_type: (value as ConnectionType) ?? 'usb' })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) =>
                      CONNECTION_TYPES.find((c) => c.value === value)?.label ?? 'USB'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CONNECTION_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                      {option.hint ? ` · ${option.hint}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kot-printer-name">Printer name</Label>
              <Input
                id="kot-printer-name"
                value={draft.printer_name ?? ''}
                placeholder="Kitchen Printer"
                onChange={(e) => patch({ printer_name: e.target.value })}
              />
            </div>
          </div>

          {!reachable && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900 dark:bg-amber-950">
              Network printers talk over a raw socket, which a browser cannot open. This needs the RevGenAI Print
              Agent, which isn&apos;t available for download yet — the settings below are saved, but tickets will not
              print until it is. Use a USB or Bluetooth printer in the meantime.
            </p>
          )}

          {draft.connection_type === 'usb' && (
            <div className="space-y-1.5">
              <Label>Detected printer</Label>
              <Select
                value={draft.printer_name ?? ''}
                onValueChange={(value) => patch({ printer_name: value ?? '' })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{(value: string | null) => value || 'Select a connected printer'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(printers ?? []).map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(printers ?? []).length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No printers detected. They are read through QZ Tray — if it isn&apos;t running, type the name above
                  instead.
                </p>
              )}
            </div>
          )}

          {(draft.connection_type === 'lan' || draft.connection_type === 'wifi') && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="kot-ip">IP address</Label>
                <Input
                  id="kot-ip"
                  value={draft.ip_address ?? ''}
                  placeholder="192.168.1.102"
                  onChange={(e) => patch({ ip_address: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kot-port">Port</Label>
                <Input
                  id="kot-port"
                  type="number"
                  value={draft.port ?? 9100}
                  onChange={(e) => patch({ port: Number(e.target.value) || 9100 })}
                />
                <p className="text-[11px] text-muted-foreground">9100 is standard for thermal printers.</p>
              </div>
            </div>
          )}

          {draft.connection_type === 'bluetooth' && (
            <p className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
              The printer must already be paired with this device. You&apos;ll be asked to choose it the first time a
              ticket prints.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Paper width</Label>
              <Select value={draft.paper_width} onValueChange={(value) => patch({ paper_width: value ?? '80mm' })}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(value: string | null) => value || '80mm'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="58mm">58mm</SelectItem>
                  <SelectItem value="80mm">80mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kot-copies">Copies</Label>
              <Input
                id="kot-copies"
                type="number"
                min={1}
                max={5}
                value={draft.copies}
                onChange={(e) => patch({ copies: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })}
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={draft.auto_print}
                onChange={(e) => patch({ auto_print: e.target.checked })}
              />
              Print automatically when a KOT is sent
            </label>
          </div>

          <div className="space-y-2">
            <Label>What the ticket shows</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {TICKET_FIELD_LABELS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={draft.ticket_fields[key]}
                    onChange={(e) => patch({ ticket_fields: { ...draft.ticket_fields, [key]: e.target.checked } })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-muted/40 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className={cn('font-medium', STATUS_STYLES[draft.connection_status])}>
                ● {testing ? 'Testing…' : STATUS_LABELS[draft.connection_status]}
              </span>
            </div>
            {draft.last_tested_at && (
              <div className="mt-1 flex items-center justify-between text-muted-foreground">
                <span>Last test</span>
                <span>{new Date(draft.last_tested_at).toLocaleString()}</span>
              </div>
            )}
            {draft.last_test_error && <p className="mt-1 text-destructive">{draft.last_test_error}</p>}
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
        {draft.enabled && (
          <>
            <Button variant="outline" disabled={testing} onClick={() => runTest(false)}>
              Test connection
            </Button>
            <Button variant="outline" disabled={testing} onClick={() => runTest(true)}>
              {testing && <Loader2 className="size-4 animate-spin" />}
              Test KOT print
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
