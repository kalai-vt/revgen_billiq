/** USB ESC/POS adapter — uses the `usb` package (WebUSB-style native bindings, an optional
 * dependency) to write raw bytes directly to a USB thermal printer's bulk-out endpoint.
 *
 * IMPORTANT — unlike `NetworkAdapter` and `OsPrinterAdapter` (Windows spooler path), this adapter
 * is **not verified against real hardware** in this repo: there is no physical USB thermal
 * printer available in this dev environment, and `usb`'s native module may not even compile in a
 * sandboxed build (it needs libusb + a working node-gyp toolchain). The interface, vendor/product
 * ID enumeration, and byte-write logic follow the `usb` package's documented API exactly, and the
 * ESC/POS bytes it writes are the same `buildReceiptCommands` output already verified byte-exact
 * in `test/escpos.test.ts` — but the actual USB transfer has only been exercised against whatever
 * `usb.getDeviceList()` finds on this machine (typically nothing printer-shaped), not a real
 * printer. Flag this explicitly during Phase 1 hardware QA (spec §30/§31) before relying on it.
 */

import type { PrinterAdapter, PrinterCapabilities, PrinterInfo, PrintDocument } from '../types.js';
import {
  buildReceiptCommands,
  buildTestPrintCommands,
  toBytes,
  type ReceiptBusinessInfo,
  type ReceiptData,
  type ThermalPaperSize,
} from '../renderer/escpos.js';
import { logger } from '../log.js';

const RAW_CAPABILITIES: PrinterCapabilities = { cut: true, cashDrawer: true, qrCode: true, barcode: true, logo: true };

// Common USB printer-class interface subclass/protocol per the USB spec (class 0x07 = Printer);
// most generic ESC/POS thermal printers enumerate this way, which is how discover() tells a
// printer-shaped device apart from every other USB peripheral without a hardcoded vendor list.
const PRINTER_CLASS = 0x07;

export interface UsbPrinterConfig {
  printerId: string;
  name: string;
  vendorId: number;
  productId: number;
  paperWidth: ThermalPaperSize;
}

export class UsbEscPosAdapter implements PrinterAdapter {
  readonly connectionType = 'usb' as const;
  private readonly configs = new Map<string, UsbPrinterConfig>();

  configure(config: UsbPrinterConfig): void {
    this.configs.set(config.printerId, config);
  }

  async discover(): Promise<PrinterInfo[]> {
    let usb: typeof import('usb');
    try {
      usb = await import('usb');
    } catch (err) {
      // `usb` isn't installed/didn't compile on this machine (it's an optionalDependency — see
      // package.json) — report no USB printers rather than crashing the whole discovery call
      // (network/OS adapters should still work), but log it: silently returning [] here is
      // indistinguishable from "no USB printer is plugged in" without this, which makes a real
      // packaging failure on a customer's machine impossible to diagnose from agent.log.
      logger.warn('[print-agent] USB adapter unavailable — the `usb` native module did not load:', err);
      return [];
    }
    const devices = usb.getDeviceList();
    const found: PrinterInfo[] = [];
    for (const device of devices) {
      const descriptor = device.deviceDescriptor;
      const known = [...this.configs.values()].find(
        (c) => c.vendorId === descriptor.idVendor && c.productId === descriptor.idProduct,
      );
      const isPrinterClass =
        descriptor.bDeviceClass === PRINTER_CLASS ||
        device.configDescriptor?.interfaces.some((iface) => iface.some((alt) => alt.bInterfaceClass === PRINTER_CLASS));
      // A manually configured vendor/product ID is trusted outright, regardless of the device's
      // declared USB class. Many real-world cheap thermal printers (exactly the "not all printer
      // types work" complaint this is fixing) never declare the standard USB Printer class at all
      // — they enumerate as a vendor-specific or CDC-ACM serial-bridge chip instead — so gating on
      // isPrinterClass unconditionally silently dropped precisely the printers this configure()
      // mechanism exists to handle. Unconfigured devices still need the class check, or every
      // random USB peripheral (mice, storage, webcams) would show up as a "printer".
      if (!known && !isPrinterClass) continue;
      found.push({
        printerId: known?.printerId ?? `usb:${descriptor.idVendor.toString(16)}:${descriptor.idProduct.toString(16)}`,
        name: known?.name ?? `USB Printer ${descriptor.idVendor.toString(16)}:${descriptor.idProduct.toString(16)}`,
        brand: 'Generic',
        model: 'USB ESC/POS',
        connectionType: 'usb',
        paperWidth: known?.paperWidth ?? '80mm',
        status: 'connected',
        role: 'receipt',
        capabilities: RAW_CAPABILITIES,
      });
    }
    return found;
  }

  async connect(): Promise<void> {
    // Opened per-print in print() — USB devices are claimed for the shortest possible window so a
    // second adapter instance (or the OS) isn't locked out between jobs.
  }

  async disconnect(): Promise<void> {}

  async getStatus(printerId: string): Promise<PrinterInfo['status']> {
    const printers = await this.discover();
    return printers.find((p) => p.printerId === printerId)?.status ?? 'disconnected';
  }

  async print(printerId: string, document: PrintDocument): Promise<void> {
    const config = this.configs.get(printerId);
    if (document.type === 'test_print') {
      await this.writeBytes(printerId, toBytes(buildTestPrintCommands(config?.paperWidth ?? '80mm')));
      return;
    }
    if (!document.receipt) {
      throw new Error(`UsbEscPosAdapter only supports the thermal (ESC/POS) path — printer ${printerId} was sent a document with no receipt payload.`);
    }
    const { business, data } = document.receipt as { business: ReceiptBusinessInfo; data: ReceiptData };
    const commands = buildReceiptCommands(business, data, config?.paperWidth ?? '80mm');
    await this.writeBytes(printerId, toBytes(commands));
  }

  async cancel(): Promise<void> {
    // Once bytes are written to the bulk-out endpoint they're already in the printer's buffer —
    // nothing left on this side to cancel, same reasoning as NetworkAdapter.
  }

  async openCashDrawer(printerId: string): Promise<void> {
    const { cashDrawerPulse } = await import('../renderer/escpos.js');
    await this.writeBytes(printerId, toBytes([cashDrawerPulse()]));
  }

  async cutPaper(printerId: string): Promise<void> {
    await this.writeBytes(printerId, toBytes(['\x1DV\x01']));
  }

  async getCapabilities(): Promise<PrinterCapabilities> {
    return RAW_CAPABILITIES;
  }

  private async writeBytes(printerId: string, bytes: Uint8Array): Promise<void> {
    const usb = await import('usb');
    const config = this.configs.get(printerId);
    if (!config) throw new Error(`Unknown or unconfigured USB printer: ${printerId}. Pair/configure it in Settings first.`);
    const device = usb.findByIds(config.vendorId, config.productId);
    if (!device) throw new Error(`USB printer ${config.name} is not connected.`);
    device.open();
    try {
      const iface = device.interfaces?.find((i) => i.descriptor.bInterfaceClass === PRINTER_CLASS) ?? device.interfaces?.[0];
      if (!iface) throw new Error(`USB printer ${config.name} exposed no usable interface.`);
      iface.claim();
      const outEndpoint = iface.endpoints.find((e) => e.direction === 'out');
      if (!outEndpoint || outEndpoint.transferType !== usb.usb.LIBUSB_TRANSFER_TYPE_BULK) {
        throw new Error(`USB printer ${config.name} exposed no bulk OUT endpoint.`);
      }
      await new Promise<void>((resolve, reject) => {
        (outEndpoint as unknown as { transfer: (data: Buffer, cb: (err?: Error) => void) => void }).transfer(
          Buffer.from(bytes),
          (err) => (err ? reject(err) : resolve()),
        );
      });
      // release() is callback-based — the `usb` package's own documented pattern is
      // `iface.release(cb => device.close())`, not release-then-close unawaited, since closing the
      // device before the interface has actually finished releasing can throw or silently fail on
      // some platforms/drivers, and any release() error was previously swallowed by the empty
      // callback. Left unfixed, this could leave the device unable to be claimed by the *next*
      // print job to the same USB printer.
      await new Promise<void>((resolve, reject) => {
        iface.release((err?: Error) => (err ? reject(err) : resolve()));
      });
    } finally {
      device.close();
    }
  }
}
