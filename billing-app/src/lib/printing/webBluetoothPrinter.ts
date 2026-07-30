import { toBytes } from '@/lib/printing/escposBytes';

/** Direct-to-printer silent printing over Web Bluetooth, for Android tablets/phones (no QZ Tray
 * equivalent exists on Android — see `qzTray.ts`). This is **best-effort**: Web Bluetooth only
 * reaches BLE GATT devices, not classic Bluetooth SPP/RFCOMM, which many commodity 58mm thermal
 * printers actually use — so compatibility depends on the specific printer exposing a BLE write
 * characteristic. There's no single standard "ESC/POS over BLE" profile across vendors; this
 * tries a curated set of service UUIDs commonly seen in cheap BLE thermal-printer modules. Prefer
 * `webUsbPrinter.ts` when the tablet supports USB-OTG — USB printer class is an actual standard.
 * Pairing is a one-time browser permission grant tied to this specific device+browser — see
 * `deviceProfile.ts` for why that can't be a tenant-wide setting. */

export class WebBluetoothPrinterError extends Error {}

// Common vendor UUIDs for BLE "transparent UART"-style thermal printer modules. Not exhaustive —
// printers outside this list simply won't be writable over Bluetooth from this app.
const CANDIDATE_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // widely used generic BLE "printer service"
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/Microchip transparent UART
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (NUS)
  '0000ff00-0000-1000-8000-00805f9b34fb', // common vendor "custom" service
];

// Conservative default ATT MTU payload (23-byte ATT_MTU minus 3-byte header) — safe across
// virtually all BLE stacks. Larger negotiated MTUs would allow bigger chunks, but Web Bluetooth
// doesn't expose the negotiated MTU, so this stays deliberately small for reliability.
const CHUNK_SIZE = 20;
const CHUNK_DELAY_MS = 15;

export function isAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer,
): Promise<BluetoothRemoteGATTCharacteristic> {
  const services = await server.getPrimaryServices();
  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    const writable = characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse);
    if (writable) return writable;
  }
  throw new WebBluetoothPrinterError(
    'This Bluetooth printer does not expose a supported write characteristic. Try connecting it over USB instead.',
  );
}

/** Opens the browser's device picker. Must be called from a user gesture per the Web Bluetooth
 * spec. `acceptAllDevices` is used (rather than filtering by service) because printer modules
 * rarely advertise a service UUID in their scan response — the curated UUIDs are only used
 * afterwards, as `optionalServices`, to unlock GATT access to them. */
export async function pair(): Promise<BluetoothDevice> {
  if (!isAvailable()) throw new WebBluetoothPrinterError('Web Bluetooth is not supported in this browser.');
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: CANDIDATE_SERVICE_UUIDS,
    });
    if (!device.gatt) throw new WebBluetoothPrinterError('Selected device has no GATT server.');
    const server = await device.gatt.connect();
    await findWritableCharacteristic(server);
    return device;
  } catch (err) {
    throw new WebBluetoothPrinterError(
      err instanceof Error && err.message ? err.message : 'No Bluetooth printer was selected.',
    );
  }
}

/** Reuses a previously-granted pairing without re-prompting. Returns null if nothing has been
 * paired yet on this device. */
export async function reconnect(): Promise<BluetoothDevice | null> {
  if (!isAvailable()) return null;
  const devices = await navigator.bluetooth.getDevices();
  return devices[0] ?? null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function printRaw(commands: string[]): Promise<void> {
  const device = await reconnect();
  if (!device?.gatt) throw new WebBluetoothPrinterError('No Bluetooth printer is paired on this device yet.');
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  const characteristic = await findWritableCharacteristic(server);
  const bytes = toBytes(commands);

  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + CHUNK_SIZE);
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    if (offset + CHUNK_SIZE < bytes.length) await delay(CHUNK_DELAY_MS);
  }
}
