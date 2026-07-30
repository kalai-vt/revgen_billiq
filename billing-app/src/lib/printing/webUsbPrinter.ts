import { toBytes } from '@/lib/printing/escposBytes';

/** Direct-to-printer silent printing over Web USB, for Android tablets/phones with USB-OTG (no
 * QZ Tray equivalent exists on Android — see `qzTray.ts`). USB device class 7 ("Printer class")
 * is a real, standard USB spec most ESC/POS USB thermal printers implement, so this is the more
 * reliable of the two Android transports (compare `webBluetoothPrinter.ts`, which is
 * printer-model-dependent). Pairing is a one-time browser permission grant tied to this specific
 * device+browser — see `deviceProfile.ts` for why that can't be a tenant-wide setting. */

export class WebUsbPrinterError extends Error {}

const PRINTER_CLASS_CODE = 7;

export function isAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

interface OutEndpoint {
  interfaceNumber: number;
  endpointNumber: number;
}

function findOutEndpoint(device: USBDevice): OutEndpoint | null {
  const configuration = device.configuration ?? device.configurations[0];
  for (const iface of configuration?.interfaces ?? []) {
    const endpoint = iface.alternate.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk');
    if (endpoint) return { interfaceNumber: iface.interfaceNumber, endpointNumber: endpoint.endpointNumber };
  }
  return null;
}

async function ensureReady(device: USBDevice): Promise<OutEndpoint> {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const endpoint = findOutEndpoint(device);
  if (!endpoint) throw new WebUsbPrinterError('This USB device has no printable (bulk OUT) endpoint.');
  await device.claimInterface(endpoint.interfaceNumber);
  return endpoint;
}

/** Opens the browser's device picker, scoped to USB printer-class devices. Must be called from a
 * user gesture (e.g. a button click) per the Web USB spec. */
export async function pair(): Promise<USBDevice> {
  if (!isAvailable()) throw new WebUsbPrinterError('Web USB is not supported in this browser.');
  try {
    const device = await navigator.usb.requestDevice({ filters: [{ classCode: PRINTER_CLASS_CODE }] });
    await ensureReady(device);
    return device;
  } catch (err) {
    throw new WebUsbPrinterError(
      err instanceof Error && err.message ? err.message : 'No USB printer was selected.',
    );
  }
}

/** Reuses a previously-granted pairing without re-prompting, so returning to the checkout screen
 * doesn't ask again. Returns null if nothing has been paired yet on this device. */
export async function reconnect(): Promise<USBDevice | null> {
  if (!isAvailable()) return null;
  const devices = await navigator.usb.getDevices();
  return devices[0] ?? null;
}

export async function printRaw(commands: string[]): Promise<void> {
  const device = await reconnect();
  if (!device) throw new WebUsbPrinterError('No USB printer is paired on this device yet.');
  const endpoint = await ensureReady(device);
  const bytes = toBytes(commands);
  const result = await device.transferOut(endpoint.endpointNumber, bytes);
  if (result.status !== 'ok') {
    throw new WebUsbPrinterError(`USB print transfer failed (status: ${result.status}).`);
  }
}
