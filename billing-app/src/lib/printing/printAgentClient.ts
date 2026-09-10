/** Browser-side client for the RevGenAI Print Agent (see `print-agent/` at the repo root) — the
 * QZ Tray replacement. Deliberately mirrors `qzTray.ts`'s shape (`connect`/`listPrinters`/
 * `printPdf`/`isAvailable`) so wiring it into Settings/InvoiceSuccessDialog alongside the existing
 * QZ path is close to a drop-in addition, per the migration plan's "don't break existing
 * customers" requirement — this is Phase 1 of that migration, added alongside QZ, not replacing it.
 *
 * Unlike QZ Tray, every request here is authenticated: `ensureConnected` first asks the backend
 * for a short-lived, signed session token (`/api/printing/agent/session-token`) scoped to this
 * tenant's own paired device, and the agent verifies that signature itself before accepting
 * anything else on the socket. There is no anonymous/unsigned fallback mode — if pairing hasn't
 * happened yet, every call here fails fast with a clear "not paired" error instead of silently
 * degrading. */

import { request } from '@/lib/api-client';
import type { KotTicketData, ReceiptBusinessInfo, ReceiptData, ThermalPaperSize } from '@/lib/printing/escpos';

const AGENT_WS_URL = 'ws://127.0.0.1:47811';
const AGENT_ADMIN_URL = 'http://127.0.0.1:47812';
const DEVICE_ID_KEY = 'revgeniq_print_agent_device_id';

export class PrintAgentError extends Error {}

// Which local agent device this browser/till talks to — per-device local state, same convention
// as deviceProfile.ts's own localStorage usage (a device_id from pairing can't be a tenant-wide
// Setting any more than a Bluetooth pairing could be).
export function getPairedDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

function saveDeviceId(deviceId: string): void {
  try {
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  } catch {
    // Best-effort — a failed write just means pairing has to be repeated next visit.
  }
}

export function clearPairedDevice(): void {
  try {
    localStorage.removeItem(DEVICE_ID_KEY);
  } catch {
    // Nothing to clean up if storage was already unavailable.
  }
}

export interface PairingCodeResult {
  code: string;
  expiresAt: string;
}

export async function requestPairingCode(): Promise<PairingCodeResult> {
  const data = await request<{ code: string; expires_at: string }>('/api/printing/agent/pairing-code', { method: 'POST' });
  return { code: data.code, expiresAt: data.expires_at };
}

/** Opens the agent's own local pairing page with the code pre-filled — the agent is always on
 * this same machine (127.0.0.1), so this is a same-computer new-tab, not a remote link. */
export function openAgentPairingPage(code: string): void {
  window.open(`${AGENT_ADMIN_URL}/pair?code=${encodeURIComponent(code)}`, '_blank', 'noopener,noreferrer');
}

interface AgentDeviceSummary {
  id: string;
  name: string | null;
  platform: string;
  agent_version: string;
  paired_at: string;
  last_seen: string | null;
}

export async function listPairedDevices(): Promise<AgentDeviceSummary[]> {
  return request<AgentDeviceSummary[]>('/api/printing/agent/devices');
}

/** Polls for a device paired after `since` (the moment the pairing code was requested) and saves
 * it as this browser's device once found — there's no push notification from the agent back to
 * the backend, so polling is the simplest thing that works for a one-time, human-paced setup
 * step. Not used on the hot (print) path at all. */
/** The backend returns `paired_at` as a naive ISO string with no UTC designator (confirmed
 * against the real `/agent/devices` response — no trailing `Z` or `+00:00`), so a bare
 * `new Date(...)` silently misparses it as *local* time instead of UTC. That's invisible in a
 * UTC-based dev environment but breaks completely anywhere with a non-zero offset — confirmed on
 * a UTC+5:30 machine, where it shifted every timestamp ~5.5 hours backward and made pairing look
 * like it never completed even though it had, every single time. */
export function parseUtcTimestamp(value: string): number {
  const hasTimezoneDesignator = /Z$|[+-]\d{2}:?\d{2}$/.test(value);
  return new Date(hasTimezoneDesignator ? value : `${value}Z`).getTime();
}

export async function waitForPairing(since: number, timeoutMs = 120_000, pollMs = 2000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const devices = await listPairedDevices().catch((err) => {
      console.warn('[print-agent] Polling for pairing failed (will retry):', err);
      return [];
    });
    const match = devices.find((d) => parseUtcTimestamp(d.paired_at) >= since);
    if (match) {
      saveDeviceId(match.id);
      return match.id;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new PrintAgentError('Timed out waiting for pairing. Make sure you entered the code in the RevGenAI Print Agent.');
}

// ---- WebSocket RPC layer ----

interface RpcResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

let socket: WebSocket | null = null;
let connectingPromise: Promise<void> | null = null;
const pending = new Map<string, (msg: RpcResponse) => void>();
let msgCounter = 0;

function isOpen(): boolean {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

async function doConnect(): Promise<void> {
  const deviceId = getPairedDeviceId();
  if (!deviceId) throw new PrintAgentError('Print Agent is not connected on this device yet — set it up in Settings first.');

  const { token, signature } = await request<{ token: string; signature: string }>('/api/printing/agent/session-token', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId }),
  });

  await new Promise<void>((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(AGENT_WS_URL);
    } catch {
      reject(new PrintAgentError('Print Agent is not running on this computer.'));
      return;
    }
    const timeout = setTimeout(() => {
      ws.close();
      reject(new PrintAgentError('Timed out connecting to Print Agent. Is it running?'));
    }, 5000);

    ws.onopen = () => ws.send(JSON.stringify({ id: 'auth', type: 'auth', deviceId, token, signature }));
    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new PrintAgentError('Print Agent is not running on this computer.'));
    };
    ws.onclose = () => {
      socket = null;
    };
    ws.onmessage = (event) => {
      let msg: RpcResponse;
      try {
        msg = JSON.parse(event.data as string) as RpcResponse;
      } catch {
        return;
      }
      if (msg.id === 'auth') {
        clearTimeout(timeout);
        if (msg.ok) {
          socket = ws;
          resolve();
        } else {
          ws.close();
          reject(new PrintAgentError(msg.error ?? 'Authentication with Print Agent failed.'));
        }
        return;
      }
      const handler = pending.get(msg.id);
      if (handler) {
        pending.delete(msg.id);
        handler(msg);
      }
    };
  });
}

async function ensureConnected(): Promise<void> {
  if (isOpen()) return;
  if (!connectingPromise) {
    connectingPromise = doConnect().finally(() => {
      connectingPromise = null;
    });
  }
  await connectingPromise;
}

function rpc<T>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = `req-${++msgCounter}`;
    pending.set(id, (msg) => {
      if (msg.ok) resolve(msg.data as T);
      else reject(new PrintAgentError(msg.error ?? 'Print Agent request failed.'));
    });
    socket!.send(JSON.stringify({ id, type, ...payload }));
  });
}

export async function connect(): Promise<void> {
  await ensureConnected();
}

/** Resolves true/false rather than throwing — mirrors qzTray.ts's isAvailable, used to decide
 * whether to offer this transport at all before wiring up auto-print. */
export async function isAvailable(): Promise<boolean> {
  try {
    await connect();
    return true;
  } catch {
    return false;
  }
}

export interface AgentPrinterInfo {
  printerId: string;
  name: string;
  brand: string;
  model: string;
  connectionType: string;
  paperWidth: string;
  status: string;
  role: string;
}

export async function listPrinters(): Promise<AgentPrinterInfo[]> {
  await ensureConnected();
  return rpc<AgentPrinterInfo[]>('getPrinters');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error ?? new PrintAgentError('Could not read PDF for printing.'));
    reader.readAsDataURL(blob);
  });
}

/** Sends the receipt's business/customer/item data as-is — the agent renders it to ESC/POS itself
 * using the same rendering logic as `lib/printing/escpos.ts` (ported byte-for-byte, see
 * `print-agent/src/renderer/escpos.ts`), so BillIQ never needs to know which printer protocol is
 * actually in use on the other end (spec's "SaaS app shouldn't construct printer-specific
 * commands" — the whole point of the PrintDocument abstraction this agent implements). */
export async function printThermal(
  printerId: string,
  business: ReceiptBusinessInfo,
  data: ReceiptData,
  paperSize: ThermalPaperSize,
): Promise<void> {
  if (!printerId) throw new PrintAgentError('No printer is configured for automatic printing.');
  await ensureConnected();
  await rpc('print', {
    printJobId: crypto.randomUUID(),
    printerId,
    document: { type: 'tax_invoice', paperWidth: paperSize, receipt: { business, data } },
  });
}

/** Prints an already-rendered PDF (the Invoice Designer's own output, same as `qzTray.printPdf`)
 * via the printer's OS driver, for A5/A4/Letter/Legal. */
export async function printPdf(printerId: string, pdf: Blob): Promise<void> {
  if (!printerId) throw new PrintAgentError('No printer is configured for automatic printing.');
  await ensureConnected();
  const pdfBase64 = await blobToBase64(pdf);
  await rpc('print', {
    printJobId: crypto.randomUUID(),
    printerId,
    document: { type: 'tax_invoice', paperWidth: 'A4', pdfBase64 },
  });
}

/** A standalone printer/connectivity check — no invoice/amount data of any kind, matching
 * `escpos.ts`'s `buildTestPrintCommands` intent exactly (the agent builds the same test page
 * itself; see `print-agent/src/renderer/escpos.ts::buildTestPrintCommands`). */
export async function testPrint(printerId: string, paperWidth: string): Promise<void> {
  if (!printerId) throw new PrintAgentError('No printer is configured for automatic printing.');
  await ensureConnected();
  await rpc('print', { printJobId: crypto.randomUUID(), printerId, document: { type: 'test_print', paperWidth } });
}

/** Sends a kitchen ticket. Like `printThermal`, the agent renders it — `print-agent`'s
 * `renderer/escpos.ts::buildKotCommands` is the same code as this app's, so the ticket is
 * byte-identical whichever transport a till happens to use. */
export async function printKot(printerId: string, kot: KotTicketData, paperSize: ThermalPaperSize): Promise<void> {
  if (!printerId) throw new PrintAgentError('No printer is configured for automatic printing.');
  await ensureConnected();
  await rpc('print', {
    printJobId: crypto.randomUUID(),
    printerId,
    document: { type: 'kot', paperWidth: paperSize, kot },
  });
}
