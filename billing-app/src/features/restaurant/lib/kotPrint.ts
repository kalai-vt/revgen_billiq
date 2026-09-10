/** Printing a Kitchen Order Ticket.
 *
 * Separate from the receipt path in `features/pos/lib/silentPrint.ts` for one reason that matters
 * physically: the KOT prints at the kitchen pass while the bill prints at the till, so it uses the
 * tenant's `kot_printer_name` rather than the billing printer. When that is blank it falls back to
 * the billing printer, which is what keeps a single-printer shop working with no extra setup.
 *
 * A KOT is always a thermal ticket — there is no PDF/A4 path, because an A4 kitchen ticket isn't a
 * thing — so this only ever sends raw ESC/POS.
 */

import * as settingsApi from '@/features/settings/api';
import type { Kot, RestaurantOrder } from '@/features/restaurant/api';
import { resolveDeviceMode } from '@/lib/printing/deviceProfile';
import * as qzTray from '@/lib/printing/qzTray';
import * as printAgentClient from '@/lib/printing/printAgentClient';
import * as webUsbPrinter from '@/lib/printing/webUsbPrinter';
import * as webBluetoothPrinter from '@/lib/printing/webBluetoothPrinter';
import { buildKotCommands, type KotTicketData } from '@/lib/printing/escpos';

export type KotPrintFailure = 'not-configured' | 'browser-dialog' | 'no-printer' | 'transport-failed';

export type KotPrintResult = { ok: true } | { ok: false; reason: KotPrintFailure; detail?: string };

/** What to tell the user when a ticket didn't reach the kitchen.
 *
 * This never fails silently: a KOT that didn't print means the kitchen does not know about the
 * food, which is materially worse than a receipt that didn't print, so every failure has a
 * message telling the user to hand the ticket over or fix the setup.
 */
export function kotPrintFailureMessage(result: Extract<KotPrintResult, { ok: false }>): string {
  switch (result.reason) {
    case 'not-configured':
    case 'browser-dialog':
      return 'Sent to the kitchen screen, but no kitchen printer is set up — tell the kitchen directly. Configure one in Settings › Automatic Printing.';
    case 'no-printer':
      return 'Sent to the kitchen screen, but no printer is selected for tickets — tell the kitchen directly.';
    case 'transport-failed':
      return `Sent to the kitchen screen, but the ticket didn't print${result.detail ? ` (${result.detail})` : ''} — tell the kitchen directly.`;
  }
}

export function buildKotTicket(kot: Kot, order: RestaurantOrder, reprint = false): KotTicketData {
  return {
    kotNumber: kot.kot_number,
    orderNumber: order.order_number,
    tableName: order.table_name,
    orderType: order.order_type,
    createdAt: kot.created_at,
    reprint,
    notes: kot.notes,
    items: kot.items.map((item) => ({
      name: item.product_name,
      quantity: item.quantity,
      notes: item.notes,
    })),
  };
}

export async function printKot(kot: Kot, order: RestaurantOrder, reprint = false): Promise<KotPrintResult> {
  const preferences = await settingsApi.getBusinessPreferences();
  const deviceMode = resolveDeviceMode(preferences.auto_print_device_mode);
  // Blank kitchen printer means "same machine as the bill" — see the model comment on
  // settings.kot_printer_name.
  const printerName = preferences.kot_printer_name || preferences.auto_print_printer_name;

  if (!deviceMode) return { ok: false, reason: 'not-configured' };
  if (deviceMode === 'browser-dialog') return { ok: false, reason: 'browser-dialog' };
  if ((deviceMode === 'qz' || deviceMode === 'revgenai-agent') && !printerName) {
    return { ok: false, reason: 'no-printer' };
  }

  const ticket = buildKotTicket(kot, order, reprint);

  try {
    if (deviceMode === 'revgenai-agent') {
      // The agent renders the ticket itself from this structured payload, using the same
      // buildKotCommands code ported into `print-agent/src/renderer/escpos.ts` — so the app never
      // constructs printer-specific bytes for the transport that has its own renderer.
      await printAgentClient.printKot(printerName!, ticket, preferences.kot_paper_size);
      return { ok: true };
    }

    // Every other transport is a dumb pipe for bytes, so build them here.
    const commands = buildKotCommands(ticket, preferences.kot_paper_size);
    if (deviceMode === 'web-usb') {
      await webUsbPrinter.printRaw(commands);
    } else if (deviceMode === 'web-bluetooth') {
      await webBluetoothPrinter.printRaw(commands);
    } else {
      await qzTray.printRaw(printerName!, commands);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: 'transport-failed',
      detail: err instanceof Error ? err.message : undefined,
    };
  }
}
