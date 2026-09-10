/** Raw-TCP ESC/POS adapter — the one thermal-printer transport testable end-to-end without real
 * hardware or a native npm module: it's a plain `net.Socket` write to port 9100 (the near-universal
 * "raw JetDirect" port every network thermal/label printer listens on), so a test can point it at
 * a mock TCP server and assert the exact bytes received. Configured printers are static entries
 * (host:port) rather than "discovered" — there is no reliable zero-config network-printer discovery
 * protocol this adapter can lean on for Phase 1; mDNS/Bonjour discovery is a documented follow-up,
 * not implemented here. */

import { Socket } from 'node:net';
import type { PrinterAdapter, PrinterCapabilities, PrinterInfo, PrintDocument } from '../types.js';
import {
  toBytes,
  type ThermalPaperSize,
} from '../renderer/escpos.js';
import { buildDocumentCommands } from '../renderer/document.js';

export interface NetworkPrinterConfig {
  printerId: string;
  name: string;
  brand?: string;
  model?: string;
  host: string;
  port?: number;
  paperWidth: ThermalPaperSize;
}

const RAW_CAPABILITIES: PrinterCapabilities = { cut: true, cashDrawer: true, qrCode: true, barcode: true, logo: true };

export class NetworkAdapter implements PrinterAdapter {
  readonly connectionType = 'network' as const;
  private readonly configs = new Map<string, NetworkPrinterConfig>();

  /** Statically registers a network printer (Settings > Hardware & Printing "Configure" flow
   * writes these to the agent's local config file — see `pairing.ts`'s config persistence). */
  configure(config: NetworkPrinterConfig): void {
    this.configs.set(config.printerId, config);
  }

  async discover(): Promise<PrinterInfo[]> {
    return [...this.configs.values()].map((c) => ({
      printerId: c.printerId,
      name: c.name,
      brand: c.brand ?? 'Generic',
      model: c.model ?? 'Network ESC/POS',
      connectionType: 'network',
      paperWidth: c.paperWidth,
      status: 'unknown',
      role: 'receipt',
      capabilities: RAW_CAPABILITIES,
    }));
  }

  async connect(): Promise<void> {
    // Stateless transport — each print() opens and closes its own socket, so there is nothing to
    // hold open here. Present for interface conformance (spec §7).
  }

  async disconnect(): Promise<void> {}

  async getStatus(printerId: string): Promise<PrinterInfo['status']> {
    const config = this.requireConfig(printerId);
    return new Promise((resolve) => {
      const socket = new Socket();
      const finish = (status: PrinterInfo['status']) => {
        socket.destroy();
        resolve(status);
      };
      socket.setTimeout(2000);
      socket.once('connect', () => finish('connected'));
      socket.once('timeout', () => finish('disconnected'));
      socket.once('error', () => finish('disconnected'));
      socket.connect(config.port ?? 9100, config.host);
    });
  }

  async print(printerId: string, document: PrintDocument): Promise<void> {
    const config = this.requireConfig(printerId);
    let commands: string[];
    try {
      commands = buildDocumentCommands(document, config.paperWidth);
    } catch (err) {
      throw new Error(
        `NetworkAdapter only supports the thermal (ESC/POS) path — printer ${printerId} ${err instanceof Error ? err.message : 'was sent an unrenderable document.'}`,
      );
    }
    await this.writeBytes(config, toBytes(commands));
  }

  async cancel(): Promise<void> {
    // Nothing to cancel mid-flight — print() is a single synchronous socket write per job, there
    // is no queued state on the printer side this adapter tracks once bytes are sent.
  }

  async openCashDrawer(printerId: string): Promise<void> {
    const config = this.requireConfig(printerId);
    const { cashDrawerPulse, toBytes: bytesOf } = await import('../renderer/escpos.js');
    await this.writeBytes(config, bytesOf([cashDrawerPulse()]));
  }

  async cutPaper(printerId: string): Promise<void> {
    const config = this.requireConfig(printerId);
    await this.writeBytes(config, toBytes(['\x1DV\x01']));
  }

  async getCapabilities(): Promise<PrinterCapabilities> {
    return RAW_CAPABILITIES;
  }

  private requireConfig(printerId: string): NetworkPrinterConfig {
    const config = this.configs.get(printerId);
    if (!config) throw new Error(`Unknown network printer: ${printerId}`);
    return config;
  }

  private writeBytes(config: NetworkPrinterConfig, bytes: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      socket.setTimeout(5000);
      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error(`Timed out connecting to ${config.host}:${config.port ?? 9100}`));
      });
      socket.once('error', (err) => reject(err));
      socket.connect(config.port ?? 9100, config.host, () => {
        socket.write(Buffer.from(bytes), (err) => {
          socket.end();
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }
}
