/** Bluetooth adapter — for a printer paired over Bluetooth (not USB), Windows exposes it as a
 * "Standard Serial over Bluetooth link (COMn)" virtual serial port with zero extra pairing work
 * once the OS-level Bluetooth pairing itself is done. This adapter discovers those SPP ports,
 * matches each one back to the paired Bluetooth device's friendly name (Windows' Ports-class PnP
 * entries only expose a generic "Standard Serial over Bluetooth link" name — the actual printer
 * name comes from cross-referencing the Bluetooth-class device list by MAC address, both queried
 * via PowerShell/CIM), and writes raw ESC/POS bytes to the matched COM port (`rawSerial.ts`).
 *
 * Added after `OsPrinterAdapter`'s USB-based raw-spooler path turned out not to help here: a real
 * BillQuick-Go unit connected over USB never enumerated on the USB bus at all (confirmed via
 * `pnputil`/raw libusb access both finding nothing) — a cable/hardware-mode issue, not something
 * software can route around — while the *same physical printer*, already paired over Bluetooth,
 * worked immediately once addressed by its SPP COM port directly. Verified against real hardware.
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import type { PrinterAdapter, PrinterCapabilities, PrinterInfo, PrintDocument } from '../types.js';
import { toBytes } from '../renderer/escpos.js';
import { buildDocumentCommands } from '../renderer/document.js';
import { sendRawBytesToComPort } from '../rawSerial.js';

function isThermalPaperWidth(paperWidth: PrintDocument['paperWidth']): paperWidth is '58mm' | '80mm' {
  return paperWidth === '58mm' || paperWidth === '80mm';
}

const BT_CAPABILITIES: PrinterCapabilities = { cut: true, cashDrawer: true, qrCode: true, barcode: true, logo: false };

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `powershell exited with code ${code}`));
    });
  });
}

// One combined script: list Bluetooth-class devices (for friendly names) and Ports-class Bluetooth
// SPP entries (for COM port numbers) in a single PowerShell process, then correlate them here in
// JS rather than doing two separate shell-outs per discover() call.
const DISCOVER_SCRIPT = `
$bt = Get-PnpDevice -Class Bluetooth | Select-Object FriendlyName, InstanceId
$ports = Get-PnpDevice -Class Ports | Where-Object { $_.InstanceId -like 'BTHENUM*' } | Select-Object FriendlyName, InstanceId
[PSCustomObject]@{ bluetooth = $bt; ports = $ports } | ConvertTo-Json -Compress -Depth 4
`;

interface DiscoverRow {
  FriendlyName: string;
  InstanceId: string;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// Bluetooth PnP instance ids embed the device's MAC address as a bare 12-hex-digit run (e.g.
// `BTHENUM\DEV_DC0D51060B29\...` for the device itself, `..._DC0D51060B29_C00000000` for its SPP
// port) — extracting that is what lets a generic "Standard Serial over Bluetooth link (COM7)" port
// be matched back to the actual paired printer's name.
export function extractMac(instanceId: string): string | null {
  // Global match, not the first — an SPP port's instance id embeds the *standard Bluetooth SPP
  // service UUID* (`00001101-0000-1000-8000-00805F9B34FB`) ahead of the actual device MAC, and
  // that UUID itself contains a 12-hex-digit run (`00805F9B34FB`) that a first-match regex picks
  // up instead of the real MAC further along the string — confirmed by this returning the wrong
  // COM port against real paired hardware before this was changed to take the *last* match.
  const matches = instanceId.match(/[0-9A-Fa-f]{12}/g);
  return matches && matches.length > 0 ? matches[matches.length - 1].toUpperCase() : null;
}

export function extractComPort(friendlyName: string): string | null {
  const match = friendlyName.match(/\(COM(\d+)\)/i);
  return match ? `COM${match[1]}` : null;
}

export class BluetoothSerialAdapter implements PrinterAdapter {
  readonly connectionType = 'bluetooth' as const;

  async discover(): Promise<PrinterInfo[]> {
    if (platform() !== 'win32') {
      throw new Error('BluetoothSerialAdapter currently only implements Windows discovery — macOS support is Phase 2.');
    }
    const json = await runPowerShell(DISCOVER_SCRIPT);
    if (!json) return [];
    const parsed = JSON.parse(json) as { bluetooth?: DiscoverRow | DiscoverRow[]; ports?: DiscoverRow | DiscoverRow[] };
    const btByMac = new Map<string, string>();
    for (const row of asArray(parsed.bluetooth)) {
      const mac = extractMac(row.InstanceId);
      if (mac) btByMac.set(mac, row.FriendlyName);
    }
    const found: PrinterInfo[] = [];
    for (const row of asArray(parsed.ports)) {
      const comPort = extractComPort(row.FriendlyName);
      const mac = extractMac(row.InstanceId);
      if (!comPort || !mac) continue;
      const deviceName = btByMac.get(mac);
      // Windows creates several SPP channel entries per paired Bluetooth device (audio, generic
      // serial, etc.) even when only one is an actual printer — only surface ports that resolve to
      // a *named* paired device, so an anonymous Bluetooth serial channel unrelated to any printer
      // doesn't show up as a confusing, unusable "printer" choice in the UI.
      if (!deviceName) continue;
      found.push({
        printerId: `bt:${comPort}`,
        name: deviceName,
        brand: 'Generic',
        model: 'Bluetooth ESC/POS',
        connectionType: 'bluetooth',
        paperWidth: '80mm',
        status: 'connected',
        role: 'receipt',
        capabilities: BT_CAPABILITIES,
      });
    }
    return found;
  }

  async connect(): Promise<void> {
    // Bluetooth SPP is already connected at the OS level once paired — each print() just opens
    // and closes the COM port for the duration of that one job (see rawSerial.ts).
  }

  async disconnect(): Promise<void> {}

  async getStatus(printerId: string): Promise<PrinterInfo['status']> {
    const printers = await this.discover();
    return printers.find((p) => p.printerId === printerId)?.status ?? 'disconnected';
  }

  async print(printerId: string, document: PrintDocument): Promise<void> {
    const comPort = printerId.startsWith('bt:') ? printerId.slice(3) : printerId;
    if (!isThermalPaperWidth(document.paperWidth)) {
      throw new Error(`BluetoothSerialAdapter only supports thermal (58mm/80mm) paper — printer ${printerId} was sent a ${document.paperWidth} document.`);
    }
    let commands: string[];
    try {
      commands = buildDocumentCommands(document, document.paperWidth);
    } catch (err) {
      throw new Error(`Printer ${printerId} ${err instanceof Error ? err.message : 'was sent an unrenderable document.'}`);
    }
    try {
      await sendRawBytesToComPort(comPort, toBytes(commands));
    } catch (err) {
      throw new Error(
        `Printing to "${comPort}" over Bluetooth failed. Check that the printer is powered on and still paired. (${err instanceof Error ? err.message.split('\n')[0] : 'unknown error'})`,
      );
    }
  }

  async cancel(): Promise<void> {
    // Once bytes are written to the serial port they're already in the printer's buffer — nothing
    // left on this side to cancel, same reasoning as NetworkAdapter/UsbEscPosAdapter.
  }

  async openCashDrawer(printerId: string): Promise<void> {
    const comPort = printerId.startsWith('bt:') ? printerId.slice(3) : printerId;
    const { cashDrawerPulse } = await import('../renderer/escpos.js');
    await sendRawBytesToComPort(comPort, toBytes([cashDrawerPulse()]));
  }

  async cutPaper(printerId: string): Promise<void> {
    const comPort = printerId.startsWith('bt:') ? printerId.slice(3) : printerId;
    await sendRawBytesToComPort(comPort, toBytes(['\x1DV\x01']));
  }

  async getCapabilities(): Promise<PrinterCapabilities> {
    return BT_CAPABILITIES;
  }
}
