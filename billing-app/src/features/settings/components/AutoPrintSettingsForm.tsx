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
import type { AutoPrintDeviceMode, AutoPrintPaperSize } from '@/features/settings/api';
import { useTemplateForDocument } from '@/features/invoice-designer/hooks';
import * as qzTray from '@/lib/printing/qzTray';
import * as printAgentClient from '@/lib/printing/printAgentClient';
import * as webUsbPrinter from '@/lib/printing/webUsbPrinter';
import * as webBluetoothPrinter from '@/lib/printing/webBluetoothPrinter';
import {
  clearDeviceMode,
  isDeviceBoundMode,
  loadLocalDeviceMode,
  saveDeviceMode,
  suggestDefaultMode,
  type PrintDeviceMode,
} from '@/lib/printing/deviceProfile';
import { buildTestPrintCommands, type ThermalPaperSize } from '@/lib/printing/escpos';
import { ApiError } from '@/lib/api-client';

const PAPER_SIZE_LABELS: Record<AutoPrintPaperSize, string> = {
  '58mm': '58mm Thermal',
  '80mm': '80mm Thermal',
  A5: 'A5',
  A4: 'A4',
  letter: 'Letter',
  legal: 'Legal',
};

const DEVICE_MODE_LABELS: Record<PrintDeviceMode, string> = {
  qz: 'Desktop (Windows/Mac/Linux) — QZ Tray (legacy)',
  'revgenai-agent': 'Desktop (Windows/Mac) — RevGenAI Print Agent',
  'web-usb': 'Android tablet/phone — USB',
  'web-bluetooth': 'Android tablet/phone — Bluetooth',
  'browser-dialog': "Other — use this device's print dialog",
};

type QzStatus = 'idle' | 'checking' | 'connected' | 'unavailable';
type PairStatus = 'idle' | 'pairing' | 'paired' | 'error';
type AgentStatus = 'idle' | 'checking' | 'connected' | 'unavailable';
type AgentPairStatus = 'idle' | 'requesting' | 'waiting' | 'paired' | 'error';
// Mirrors qzTray.QzConnectionState's LNA branches, plus 'idle' for "haven't checked yet" and
// 'ok' once a connection has actually been established (LNA must have been granted for that to
// happen at all).
type LnaStatus = 'idle' | 'ok' | 'prompt' | 'denied';
type TestPrintStatus = 'idle' | 'printing';

function isThermalPaperSize(size: AutoPrintPaperSize): size is ThermalPaperSize {
  return size === '58mm' || size === '80mm';
}

export function AutoPrintSettingsForm() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });
  const { template: taxInvoiceTemplate } = useTemplateForDocument('tax_invoice');

  const [form, setForm] = useState({
    auto_print_after_checkout: false,
    auto_print_printer_name: null as string | null,
    auto_print_paper_size: '80mm' as AutoPrintPaperSize,
    auto_print_device_mode: null as AutoPrintDeviceMode | null,
  });
  const [error, setError] = useState<string | null>(null);
  const [qzStatus, setQzStatus] = useState<QzStatus>('idle');
  const [lnaStatus, setLnaStatus] = useState<LnaStatus>('idle');
  const [printers, setPrinters] = useState<string[]>([]);
  const [deviceMode, setDeviceMode] = useState<PrintDeviceMode>(() => loadLocalDeviceMode() ?? suggestDefaultMode());
  const [pairStatus, setPairStatus] = useState<PairStatus>('idle');
  const [testPrintStatus, setTestPrintStatus] = useState<TestPrintStatus>('idle');
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [agentPairStatus, setAgentPairStatus] = useState<AgentPairStatus>(() =>
    printAgentClient.getPairedDeviceId() ? 'paired' : 'idle',
  );
  const [agentPairingCode, setAgentPairingCode] = useState<string | null>(null);
  const [agentPrinters, setAgentPrinters] = useState<printAgentClient.AgentPrinterInfo[]>([]);
  const [agentTestPrintStatus, setAgentTestPrintStatus] = useState<TestPrintStatus>('idle');
  const [agentDownloadStatus, setAgentDownloadStatus] = useState<'idle' | 'checking'>('idle');

  // The printer connection itself is local to this device (see deviceProfile.ts) — check whether
  // it's already paired from a previous visit, separately from the tenant-wide settings below.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (deviceMode === 'web-usb') {
        const device = await webUsbPrinter.reconnect().catch(() => null);
        if (!cancelled && device) setPairStatus('paired');
      } else if (deviceMode === 'web-bluetooth') {
        const device = await webBluetoothPrinter.reconnect().catch(() => null);
        if (!cancelled && device) setPairStatus('paired');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceMode]);

  // Seamless reconnect: a device paired on a previous visit shouldn't need a manual "Connect"
  // click every time this page loads — if we already have a saved device_id, verify it's actually
  // reachable right now (not just "was paired at some point") and populate its printers, so the
  // form is immediately usable instead of showing a stale "Connected" badge with nothing behind it.
  useEffect(() => {
    if (deviceMode !== 'revgenai-agent' || !printAgentClient.getPairedDeviceId()) return;
    let cancelled = false;
    (async () => {
      setAgentStatus('checking');
      try {
        const found = await printAgentClient.listPrinters();
        if (cancelled) return;
        setAgentPrinters(found);
        setAgentStatus('connected');
        forgetSavedPrinterIfStale(found);
      } catch {
        if (!cancelled) setAgentStatus('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceMode]);

  // A printer id saved under a different device mode (e.g. QZ Tray stores a bare driver name like
  // "BillQuick-Go", with no "os:"/"usb:"/"net:" scheme prefix) silently carries over if the tenant
  // switches to the RevGenAI Print Agent mode without re-picking a printer from this dropdown —
  // and since the id happens to still *look* right (the raw string equals the printer's display
  // name), the UI showed it as if correctly resolved right up until an actual print was attempted
  // and failed with "Unsupported printer detected." Clearing it here as soon as we know it doesn't
  // match anything the agent currently reports turns that into an honest "no printer selected"
  // instead of a silent, print-time-only failure.
  function forgetSavedPrinterIfStale(found: printAgentClient.AgentPrinterInfo[]) {
    setForm((prev) => {
      if (!prev.auto_print_printer_name) return prev;
      if (found.some((p) => p.printerId === prev.auto_print_printer_name)) return prev;
      toast.warning(
        `The saved printer "${prev.auto_print_printer_name}" isn't recognized by the Print Agent — pick it again below and save.`,
      );
      return { ...prev, auto_print_printer_name: null };
    });
  }

  function handleDeviceModeChange(mode: PrintDeviceMode) {
    setPairStatus('idle');
    setDeviceMode(mode);
    // Only Web USB/Bluetooth need a per-device override (their pairing can't leave this device).
    // The rest are tenant-wide, so dropping the override is what lets a later change in Settings
    // actually reach this till instead of it being pinned to whatever it picked first.
    if (isDeviceBoundMode(mode)) saveDeviceMode(mode);
    else clearDeviceMode();
    // Persisted tenant-wide on Save — the picker alone doesn't commit it.
  }

  async function pairUsbPrinter() {
    setPairStatus('pairing');
    try {
      await webUsbPrinter.pair();
      setPairStatus('paired');
      toast.success('USB printer connected on this device');
    } catch (err) {
      setPairStatus('error');
      toast.error(err instanceof Error ? err.message : 'Could not connect to the USB printer');
    }
  }

  async function pairBluetoothPrinter() {
    setPairStatus('pairing');
    try {
      await webBluetoothPrinter.pair();
      setPairStatus('paired');
      toast.success('Bluetooth printer connected on this device');
    } catch (err) {
      setPairStatus('error');
      toast.error(err instanceof Error ? err.message : 'Could not connect to the Bluetooth printer');
    }
  }

  useEffect(() => {
    if (settings) {
      setForm({
        auto_print_after_checkout: settings.auto_print_after_checkout,
        auto_print_printer_name: settings.auto_print_printer_name,
        auto_print_paper_size: settings.auto_print_paper_size,
        auto_print_device_mode: settings.auto_print_device_mode,
      });
      // A till with no pairing-bound override of its own follows the tenant-wide transport, so
      // setting a printer up once reaches every other till instead of only the browser it was
      // configured in.
      if (!loadLocalDeviceMode() && settings.auto_print_device_mode) {
        setDeviceMode(settings.auto_print_device_mode);
      }
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateSettings({ ...form, auto_print_device_mode: deviceMode }),
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

  async function finishConnecting() {
    try {
      const found = await qzTray.listPrinters();
      setPrinters(found);
      setQzStatus('connected');
      setLnaStatus('ok');
      if (found.length === 0) toast.info('QZ Tray is connected but reported no printers.');
    } catch (err) {
      setQzStatus('unavailable');
      toast.error(err instanceof Error ? err.message : 'Could not connect to QZ Tray');
    }
  }

  /** Checks Local Network Access before ever attempting a websocket connection — see
   * qzTray.connectWithDiagnostics — so a browser-level block and a "QZ isn't running" failure
   * never look like the same generic error to the cashier. */
  async function detectPrinters() {
    setQzStatus('checking');
    const state = await qzTray.connectWithDiagnostics();
    if (state === 'lna-denied') {
      setQzStatus('unavailable');
      setLnaStatus('denied');
      toast.error('BillIQ needs permission to connect to the local printer service.');
      return;
    }
    if (state === 'lna-prompt') {
      setQzStatus('idle');
      setLnaStatus('prompt');
      return;
    }
    if (state === 'unavailable') {
      setQzStatus('unavailable');
      toast.error('BillIQ Printer Service is not installed or not running on this computer.');
      return;
    }
    await finishConnecting();
  }

  /** The explicit user click Chrome needs to reliably surface its own LNA permission prompt —
   * see docs/qz-tray-production-setup.md. Calls qzTray.connect() directly rather than going
   * through detectPrinters()/connectWithDiagnostics() again, since the point is to actually
   * attempt the connection now, in direct response to this click. */
  async function requestPrinterAccess() {
    setQzStatus('checking');
    try {
      await qzTray.connect();
      await finishConnecting();
    } catch (err) {
      setQzStatus('unavailable');
      toast.error(err instanceof Error ? err.message : 'Could not connect to QZ Tray');
    }
  }

  async function runTestPrint() {
    if (!form.auto_print_printer_name || !isThermalPaperSize(form.auto_print_paper_size)) return;
    setTestPrintStatus('printing');
    try {
      await qzTray.printRaw(form.auto_print_printer_name, buildTestPrintCommands(form.auto_print_paper_size));
      toast.success('Test print sent — check the printer.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Secure printer authorization failed. Please contact support.');
    } finally {
      setTestPrintStatus('idle');
    }
  }

  /** Plain `<a href="/api/printing/agent/download">` used to navigate straight to the endpoint —
   * when no installer is configured yet (settings.print_agent_download_url unset server-side, see
   * backend/app/modules/printing/router.py), that endpoint 404s with a JSON body, so the browser
   * just navigated the whole page to a raw `{"detail": "..."}` blob instead of downloading
   * anything. A HEAD request first (no body transferred either way) lets a failure show as a
   * normal toast with the page intact, and only navigates — same tab, so the browser's own
   * download handling kicks in — once the download is actually going to work. */
  async function downloadPrintAgent() {
    setAgentDownloadStatus('checking');
    try {
      const response = await fetch('/api/printing/agent/download', { method: 'HEAD' });
      if (!response.ok) {
        toast.error("The Print Agent installer isn't available for download yet. Contact support.");
        return;
      }
      window.location.href = '/api/printing/agent/download';
    } catch {
      toast.error('Could not reach the download server. Check your connection and try again.');
    } finally {
      setAgentDownloadStatus('idle');
    }
  }

  async function connectPrintAgent() {
    setAgentPairStatus('requesting');
    try {
      const { code } = await printAgentClient.requestPairingCode();
      setAgentPairingCode(code);
      setAgentPairStatus('waiting');
      printAgentClient.openAgentPairingPage(code);
      await printAgentClient.waitForPairing(Date.now());
      setAgentPairStatus('paired');
      setAgentPairingCode(null);
      toast.success('RevGenAI Print Agent connected on this device');
      await detectAgentPrinters();
    } catch (err) {
      setAgentPairStatus('error');
      toast.error(err instanceof Error ? err.message : 'Could not connect to the Print Agent');
    }
  }

  async function detectAgentPrinters() {
    setAgentStatus('checking');
    try {
      const found = await printAgentClient.listPrinters();
      setAgentPrinters(found);
      setAgentStatus('connected');
      forgetSavedPrinterIfStale(found);
      if (found.length === 0) toast.info('Print Agent is connected but reported no printers.');
    } catch (err) {
      setAgentStatus('unavailable');
      toast.error(err instanceof Error ? err.message : 'Could not connect to the Print Agent');
    }
  }

  async function runAgentTestPrint() {
    if (!form.auto_print_printer_name) return;
    setAgentTestPrintStatus('printing');
    try {
      await printAgentClient.testPrint(form.auto_print_printer_name, form.auto_print_paper_size);
      toast.success('Test print sent — check the printer.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Print Agent test print failed.');
    } finally {
      setAgentTestPrintStatus('idle');
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

      <div className="space-y-1.5">
        <Label>This device connects via</Label>
        <Select value={deviceMode} onValueChange={(v) => handleDeviceModeChange(v as PrintDeviceMode)}>
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue>{() => DEVICE_MODE_LABELS[deviceMode]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(DEVICE_MODE_LABELS) as PrintDeviceMode[]).map((key) => (
              <SelectItem key={key} value={key}>
                {DEVICE_MODE_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          This applies only to this device/browser — signing in at a different till (another
          desktop, tablet, or phone) needs its own one-time setup below.
        </p>
      </div>

      {deviceMode === 'qz' && (
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
            <p className="text-xs text-muted-foreground mt-2">
              The first time you print (or click Detect below), QZ Tray shows an{' '}
              <span className="font-medium">"Action Required"</span> popup asking to trust this
              site — check <span className="font-medium">"Remember this decision"</span> before
              clicking Allow. That's a one-time step per till: skipping the checkbox is why the
              popup would otherwise reappear on every single print.
            </p>
          </div>
          {qzStatus === 'connected' && <Badge variant="secondary">Connected</Badge>}
          {qzStatus === 'unavailable' && <Badge variant="destructive">Not detected</Badge>}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5">
            <span
              className={`size-1.5 rounded-full ${qzStatus === 'connected' ? 'bg-emerald-500' : qzStatus === 'checking' ? 'bg-amber-500' : 'bg-muted-foreground/40'}`}
            />
            QZ Tray: {qzStatus === 'connected' ? 'Connected' : qzStatus === 'checking' ? 'Connecting…' : 'Not connected'}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={`size-1.5 rounded-full ${lnaStatus === 'ok' ? 'bg-emerald-500' : lnaStatus === 'denied' ? 'bg-destructive' : lnaStatus === 'prompt' ? 'bg-amber-500' : 'bg-muted-foreground/40'}`}
            />
            Local Network Access: {lnaStatus === 'ok' ? 'OK' : lnaStatus === 'denied' ? 'Blocked' : lnaStatus === 'prompt' ? 'Permission required' : 'Not checked'}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${form.auto_print_printer_name && qzStatus === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
            Printer: {form.auto_print_printer_name && qzStatus === 'connected' ? 'Connected' : form.auto_print_printer_name || 'Not selected'}
          </span>
        </div>

        {lnaStatus === 'prompt' && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
            <p className="font-medium">Printer Connection Required</p>
            <p className="mt-1 text-xs text-muted-foreground">
              BillIQ needs permission to connect to your local printer service. This is required
              to print bills to your thermal printer. Chrome will show its own permission prompt —
              this is separate from QZ Tray's own trust dialog and is a one-time step per browser.
            </p>
            <Button type="button" size="sm" className="mt-2" onClick={requestPrinterAccess} disabled={qzStatus === 'checking'}>
              {qzStatus === 'checking' && <Loader2 className="size-4 animate-spin" />}
              Allow Printer Access
            </Button>
          </div>
        )}

        {lnaStatus === 'denied' && (
          <p className="text-xs text-destructive">
            Chrome previously blocked BillIQ from connecting to the local printer service. Open
            Chrome's site settings for this page and allow "Local network access", then click
            Detect again.
          </p>
        )}

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
              {isThermalPaperSize(form.auto_print_paper_size) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={runTestPrint}
                  disabled={!form.auto_print_printer_name || qzStatus !== 'connected' || testPrintStatus === 'printing'}
                  title="Print a test page — never creates an invoice or sale"
                >
                  {testPrintStatus === 'printing' && <Loader2 className="size-4 animate-spin" />}
                  Test Print
                </Button>
              )}
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
      )}

      {deviceMode === 'revgenai-agent' && (
      <div className="rounded-md border p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Printer (via RevGenAI Print Agent)</p>
            <p className="text-xs text-muted-foreground">
              Works with USB, network (LAN/WiFi), and thermal printers installed on this computer.
              Install the RevGenAI Print Agent once on this till, then connect it below — no
              certificates or trust popups to manage, and no need to reconfirm on every print.
            </p>
            <button
              type="button"
              onClick={downloadPrintAgent}
              disabled={agentDownloadStatus === 'checking'}
              className="mt-1 inline-block text-xs font-medium text-primary underline underline-offset-2 disabled:opacity-60"
            >
              {agentDownloadStatus === 'checking' ? 'Checking…' : "Don't have it installed yet? Download for Windows"}
            </button>
          </div>
          {agentPairStatus === 'paired' && <Badge variant="secondary">Connected</Badge>}
          {agentPairStatus === 'error' && <Badge variant="destructive">Not connected</Badge>}
        </div>

        {agentPairStatus !== 'paired' && (
          <div className="space-y-2">
            <Button type="button" onClick={connectPrintAgent} disabled={agentPairStatus === 'requesting' || agentPairStatus === 'waiting'}>
              {(agentPairStatus === 'requesting' || agentPairStatus === 'waiting') && <Loader2 className="size-4 animate-spin" />}
              Connect Print Agent
            </Button>
            {agentPairStatus === 'waiting' && agentPairingCode && (
              <p className="text-xs text-muted-foreground">
                A pairing window opened with the code <span className="font-mono font-medium">{agentPairingCode}</span>{' '}
                pre-filled — just click Pair there. If the window didn't open, make sure the
                RevGenAI Print Agent is running on this computer, then click Pair on its page.
              </p>
            )}
          </div>
        )}

        {agentPairStatus === 'paired' && (
          <>
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
                        {() =>
                          agentPrinters.find((p) => p.printerId === form.auto_print_printer_name)?.name ||
                          form.auto_print_printer_name ||
                          'No printer selected'
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {agentPrinters.length === 0 && form.auto_print_printer_name && (
                        <SelectItem value={form.auto_print_printer_name}>{form.auto_print_printer_name}</SelectItem>
                      )}
                      {agentPrinters.map((printer) => (
                        <SelectItem key={printer.printerId} value={printer.printerId}>
                          {printer.name} ({printer.connectionType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={detectAgentPrinters}
                    disabled={agentStatus === 'checking'}
                    title="Detect printers via RevGenAI Print Agent"
                  >
                    {agentStatus === 'checking' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={runAgentTestPrint}
                    disabled={!form.auto_print_printer_name || agentTestPrintStatus === 'printing'}
                    title="Print a test page — never creates an invoice or sale"
                  >
                    {agentTestPrintStatus === 'printing' && <Loader2 className="size-4 animate-spin" />}
                    Test Print
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
              58mm and 80mm print a compact ESC/POS receipt sized for thermal paper (with
              auto-cut). A5, A4, Letter, and Legal instead print the full Tax Invoice template
              from <span className="font-medium">Invoice Designer</span> to a regular printer.
            </p>
            {sizeMismatch && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Heads up: your Tax Invoice template in Invoice Designer is set to{' '}
                {taxInvoiceTemplate!.config.paper.size}, but this printer's default paper size is set to{' '}
                {form.auto_print_paper_size}. Update one of them for a consistent print.
              </p>
            )}
          </>
        )}
      </div>
      )}

      {(deviceMode === 'web-usb' || deviceMode === 'web-bluetooth') && (
      <div className="rounded-md border p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Printer ({deviceMode === 'web-usb' ? 'USB' : 'Bluetooth'})</p>
            <p className="text-xs text-muted-foreground">
              {deviceMode === 'web-usb'
                ? "Connect a USB thermal printer directly to this tablet or phone, using a USB-OTG cable/adapter if it doesn't have a full-size USB port. Works with most ESC/POS USB printers — USB printer class is a real, standard USB spec."
                : "Pair a Bluetooth thermal printer directly with this browser. This is best-effort: it only works with printers exposing a Bluetooth Low Energy (BLE) write channel, which is common on printers marketed for mobile/tablet POS use but not universal. If your printer doesn't connect, try USB instead."}
            </p>
          </div>
          {pairStatus === 'paired' && <Badge variant="secondary">Connected</Badge>}
          {pairStatus === 'error' && <Badge variant="destructive">Not connected</Badge>}
        </div>

        {!(deviceMode === 'web-usb' ? webUsbPrinter.isAvailable() : webBluetoothPrinter.isAvailable()) && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {deviceMode === 'web-usb' ? 'Web USB' : 'Web Bluetooth'} isn't supported in this browser. Try
            the latest Chrome or Edge on Android.
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={deviceMode === 'web-usb' ? pairUsbPrinter : pairBluetoothPrinter}
          disabled={pairStatus === 'pairing'}
        >
          {pairStatus === 'pairing' && <Loader2 className="size-4 animate-spin" />}
          {pairStatus === 'paired' ? 'Reconnect printer' : 'Connect printer'}
        </Button>

        <div className="space-y-1.5 max-w-sm">
          <Label>Default paper size</Label>
          <Select
            value={form.auto_print_paper_size}
            onValueChange={(v) => setForm((prev) => ({ ...prev, auto_print_paper_size: v as AutoPrintPaperSize }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{(value: string | null) => PAPER_SIZE_LABELS[(value as AutoPrintPaperSize) ?? '80mm']}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(['58mm', '80mm'] as AutoPrintPaperSize[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {PAPER_SIZE_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            USB and Bluetooth send raw ESC/POS commands straight to the printer, so only thermal
            paper sizes are supported on this connection.
          </p>
        </div>
      </div>
      )}

      {deviceMode === 'browser-dialog' && (
      <div className="rounded-md border p-4 space-y-1.5">
        <p className="text-sm font-medium">This device's print dialog</p>
        <p className="text-xs text-muted-foreground">
          No silent printing is set up on this device. Checkout will instead open the invoice in a
          new tab and trigger this device's normal print dialog, using whatever printer is set up
          at the OS level. This is the only option currently available on iOS/iPad, since Safari
          doesn't support direct USB or Bluetooth printer access.
        </p>
      </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
