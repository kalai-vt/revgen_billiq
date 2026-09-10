/** One way to reach a configured printer, whatever it is plugged into.
 *
 * KOT business logic must not care whether the kitchen printer is USB, Bluetooth or on the
 * network — it calls `printToConfiguredPrinter` and this decides how the bytes get there. That is
 * what makes adding a bar or tandoor printer later a matter of configuration rather than new
 * branching at every call site.
 *
 * The billing printer deliberately does NOT come through here. It already works through
 * `features/pos/lib/silentPrint.ts` and its own device-mode settings; rerouting it would risk a
 * working feature for every existing tenant to buy nothing.
 */

import * as qzTray from '@/lib/printing/qzTray';
import * as printAgentClient from '@/lib/printing/printAgentClient';
import * as webUsbPrinter from '@/lib/printing/webUsbPrinter';
import * as webBluetoothPrinter from '@/lib/printing/webBluetoothPrinter';
import { loadLocalDeviceMode } from '@/lib/printing/deviceProfile';
import type { KotTicketData, ThermalPaperSize } from '@/lib/printing/escpos';
import type { PrinterConfiguration } from '@/features/settings/printerApi';

/** A print job in both the forms a destination might need.
 *
 * Byte pipes (QZ Tray, WebUSB, Web Bluetooth) take the pre-built ESC/POS. The Print Agent renders
 * documents itself from structured data — it is the only transport that owns a renderer — so it
 * gets `agentDocument` instead. Carrying both here keeps that split out of the KOT business
 * logic, which should never know which transport is on the other end.
 */
export interface PrintJob {
  commands: string[];
  agentDocument?: { type: 'kot'; kot: KotTicketData; paperWidth: ThermalPaperSize };
}

export type PrintFailureReason =
  | 'not-configured'
  | 'disabled'
  | 'unsupported-transport'
  | 'no-printer'
  | 'transport-failed';

export type PrintOutcome = { ok: true } | { ok: false; reason: PrintFailureReason; detail?: string };

/** Connection types the browser can actually reach today.
 *
 * LAN and Wi-Fi are the same thing on the wire — a raw socket to the printer's port — and no
 * browser API can open one. They are stored and shown so a restaurant can record what it has,
 * but printing to them needs the Print Agent, so they are rejected here rather than failing
 * somewhere less obvious.
 */
export const BROWSER_REACHABLE: PrinterConfiguration['connection_type'][] = ['usb', 'bluetooth'];

export function isBrowserReachable(connectionType: PrinterConfiguration['connection_type']): boolean {
  return BROWSER_REACHABLE.includes(connectionType);
}

export function printFailureMessage(outcome: Extract<PrintOutcome, { ok: false }>, printerLabel = 'printer'): string {
  switch (outcome.reason) {
    case 'not-configured':
      return `No ${printerLabel} is set up yet. Add one in Settings › Printer Settings.`;
    case 'disabled':
      return `${printerLabel} printing is switched off in Settings › Printer Settings.`;
    case 'unsupported-transport':
      return `Network printers need the RevGenAI Print Agent, which isn't available yet. Use a USB or Bluetooth ${printerLabel} for now.`;
    case 'no-printer':
      return `No ${printerLabel} is selected. Pick one in Settings › Printer Settings.`;
    case 'transport-failed':
      return `The ${printerLabel} didn't respond${outcome.detail ? ` (${outcome.detail})` : ''}.`;
  }
}

/** Sends already-built ESC/POS to whichever device the configuration points at.
 *
 * `copies` is honoured here rather than by the caller so every destination gets the same
 * behaviour — a kitchen that wants two tickets gets two from every print path, not just the ones
 * that remembered to loop.
 */
export async function printToConfiguredPrinter(
  config: PrinterConfiguration | null | undefined,
  job: PrintJob,
): Promise<PrintOutcome> {
  if (!config) return { ok: false, reason: 'not-configured' };
  if (!config.enabled) return { ok: false, reason: 'disabled' };
  if (!isBrowserReachable(config.connection_type)) return { ok: false, reason: 'unsupported-transport' };

  const copies = Math.max(1, config.copies || 1);

  try {
    for (let copy = 0; copy < copies; copy += 1) {
      await sendOnce(config, job);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'transport-failed', detail: err instanceof Error ? err.message : undefined };
  }
}

async function sendOnce(config: PrinterConfiguration, job: PrintJob): Promise<void> {
  if (config.connection_type === 'bluetooth') {
    await webBluetoothPrinter.printRaw(job.commands);
    return;
  }

  // USB reaches the printer three different ways depending on what this till has set up. Prefer
  // whatever the device is already paired with rather than forcing a second setup for the
  // kitchen printer specifically.
  const deviceMode = loadLocalDeviceMode();
  if (deviceMode === 'web-usb') {
    await webUsbPrinter.printRaw(job.commands);
    return;
  }

  const printerName = config.printer_name || config.usb_device_id;
  if (!printerName) throw new Error('No printer is selected.');

  if (deviceMode === 'revgenai-agent' && job.agentDocument) {
    await printAgentClient.printKot(printerName, job.agentDocument.kot, job.agentDocument.paperWidth);
    return;
  }
  await qzTray.printRaw(printerName, job.commands);
}
