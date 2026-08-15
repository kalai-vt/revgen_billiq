/** Aggregates every configured `PrinterAdapter` (spec §7/§9) behind one surface: `discover()`
 * merges all adapters' printer lists, and every other call is routed to whichever adapter actually
 * owns the given `printerId` — the WS server (`server.ts`) never branches on connection type
 * itself, which is the whole point of the adapter interface existing. */

import type { PrinterAdapter, PrinterInfo } from './types.js';
import { logger } from './log.js';

export class UnknownPrinterError extends Error {
  constructor(printerId: string) {
    super(`Unsupported printer detected: no configured adapter owns printerId "${printerId}".`);
  }
}

export class PrinterRegistry {
  private readonly adapters: PrinterAdapter[];
  private ownerCache = new Map<string, PrinterAdapter>();

  constructor(adapters: PrinterAdapter[]) {
    this.adapters = adapters;
  }

  async discover(): Promise<PrinterInfo[]> {
    const results = await Promise.all(
      this.adapters.map(async (adapter) => {
        try {
          return await adapter.discover();
        } catch (err) {
          // One transport being unavailable (e.g. `usb` didn't compile, or this isn't Windows for
          // the OS adapter) must never fail discovery for every other transport. But a *transient*
          // failure here (e.g. a PowerShell/spooler shell-out hiccup) silently drops every printer
          // that adapter owns for this one discover() call — which then surfaces to the user as a
          // confusing "Unsupported printer detected" for a printer that was working moments ago.
          // Logging it server-side is the only way to tell "this platform doesn't support this
          // adapter" (expected, quiet) apart from "the shell-out just failed" (worth investigating)
          // after the fact.
          logger.error(`[print-agent] ${adapter.connectionType} adapter discover() failed:`, err instanceof Error ? err.message : err);
          return [];
        }
      }),
    );
    const merged = results.flat();
    this.ownerCache = new Map();
    for (let i = 0; i < this.adapters.length; i++) {
      for (const printer of results[i]) this.ownerCache.set(printer.printerId, this.adapters[i]);
    }
    return merged;
  }

  private owner(printerId: string): PrinterAdapter {
    const adapter = this.ownerCache.get(printerId);
    if (!adapter) throw new UnknownPrinterError(printerId);
    return adapter;
  }

  async forPrinter(printerId: string): Promise<PrinterAdapter> {
    if (!this.ownerCache.has(printerId)) await this.discover();
    return this.owner(printerId);
  }
}
