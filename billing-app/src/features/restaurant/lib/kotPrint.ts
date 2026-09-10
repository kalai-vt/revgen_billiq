/** Printing a Kitchen Order Ticket.
 *
 * The kitchen printer is a separate configured destination from the billing printer (see
 * `lib/printing/printerManager.ts`), because the KOT prints at the pass while the bill prints at
 * the till. Which physical transport that destination uses — USB, Bluetooth, later a network
 * printer through the Print Agent — is the printer manager's problem, not this file's.
 *
 * A KOT is always a thermal ticket: there is no PDF/A4 path, because an A4 kitchen ticket is not
 * a thing.
 */

import type { Kot, RestaurantOrder } from '@/features/restaurant/api';
import * as printerApi from '@/features/settings/printerApi';
import type { PrinterConfiguration, TicketFields } from '@/features/settings/printerApi';
import {
  printToConfiguredPrinter,
  printFailureMessage,
  type PrintOutcome,
} from '@/lib/printing/printerManager';
import { buildKotCommands, type KotTicketData, type ThermalPaperSize } from '@/lib/printing/escpos';

export type KotPrintResult = PrintOutcome;

/** What to tell staff when a ticket did not reach the kitchen.
 *
 * Never silent: a KOT that did not print means the kitchen does not know about the food, which is
 * materially worse than a receipt that did not print. Every failure says to hand the ticket over.
 */
export function kotPrintFailureMessage(result: Extract<KotPrintResult, { ok: false }>): string {
  return `${printFailureMessage(result, 'kitchen printer')} Tell the kitchen directly.`;
}

export function buildKotTicket(
  kot: Kot,
  order: RestaurantOrder,
  reprint = false,
  fields?: TicketFields,
): KotTicketData {
  return {
    kotNumber: kot.kot_number,
    orderNumber: order.order_number,
    // A toggle that hides the table number still has to leave the ticket sensible, so the field
    // is omitted rather than blanked — the renderer already handles a missing table as TAKEAWAY.
    tableName: fields && !fields.table_number ? null : order.table_name,
    orderType: order.order_type,
    createdAt: kot.created_at,
    reprint,
    notes: fields && !fields.order_notes ? null : kot.notes,
    items: kot.items.map((item) => ({
      name: item.product_name,
      quantity: item.quantity,
      notes: item.notes,
    })),
  };
}

export async function printKot(kot: Kot, order: RestaurantOrder, reprint = false): Promise<KotPrintResult> {
  const config = await printerApi.getPrinterConfig('kot').catch(() => null);
  return printKotWithConfig(config, kot, order, reprint);
}

/** Split out so callers that already hold the configuration — the settings screen's test print,
 * a retry — do not re-fetch it. */
export async function printKotWithConfig(
  config: PrinterConfiguration | null,
  kot: Kot,
  order: RestaurantOrder,
  reprint = false,
): Promise<KotPrintResult> {
  const ticket = buildKotTicket(kot, order, reprint, config?.ticket_fields);
  const paperWidth = (config?.paper_width === '58mm' ? '58mm' : '80mm') as ThermalPaperSize;
  return printToConfiguredPrinter(config, {
    commands: buildKotCommands(ticket, paperWidth),
    agentDocument: { type: 'kot', kot: ticket, paperWidth },
  });
}

/** The sample ticket behind "Test KOT Print".
 *
 * Deliberately shaped like a real KOT rather than a generic test page: the point is to prove the
 * kitchen printer produces something a cook can read at the pass — right paper width, quantities
 * legible — which a line of test text would not show.
 */
export function buildTestKotTicket(): KotTicketData {
  return {
    kotNumber: 'TEST-001',
    orderNumber: 'TEST',
    tableName: 'TEST',
    orderType: 'dine_in',
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Chicken Biryani', quantity: 2 },
      { name: 'Paneer Tikka', quantity: 1 },
      { name: 'Coke', quantity: 2 },
    ],
    notes: 'TEST PRINT',
  };
}

export async function testKotPrint(config: PrinterConfiguration): Promise<KotPrintResult> {
  const ticket = buildTestKotTicket();
  const paperWidth = (config.paper_width === '58mm' ? '58mm' : '80mm') as ThermalPaperSize;
  return printToConfiguredPrinter(config, {
    commands: buildKotCommands(ticket, paperWidth),
    agentDocument: { type: 'kot', kot: ticket, paperWidth },
  });
}
