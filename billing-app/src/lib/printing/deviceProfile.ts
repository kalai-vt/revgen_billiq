/** Which silent-printing transport reaches this tenant's printer.
 *
 * This used to be *purely* local to one browser, which turned out to be the reason printing
 * silently fell back to the system print dialog: `auto_print_printer_name` and
 * `auto_print_paper_size` are tenant-wide server settings, so Settings looked fully configured
 * on every till, while the transport — the part that says *how* to reach that printer — only
 * existed in the one browser where it was first picked. A second till, a different browser
 * profile, a reinstall or cleared site data therefore had a printer name, a paper size, and no
 * way to print.
 *
 * So the transport is now stored tenant-wide too (`settings.auto_print_device_mode`), with this
 * module keeping a per-device *override* on top. The override still matters: Web USB and Web
 * Bluetooth pairings are granted per-origin on one physical device via a user gesture, so a
 * phone's Bluetooth pairing genuinely cannot be pushed from a dashboard. QZ Tray and the
 * RevGenAI Print Agent are localhost services with no such constraint, which is exactly why
 * they belong on the server.
 */

export type PrintDeviceMode = 'qz' | 'revgenai-agent' | 'web-usb' | 'web-bluetooth' | 'browser-dialog';

const DEVICE_MODE_KEY = 'revgeniq_print_device_mode';

const VALID_MODES: PrintDeviceMode[] = ['qz', 'revgenai-agent', 'web-usb', 'web-bluetooth', 'browser-dialog'];

/** Transports whose pairing is granted per-origin on one physical device and so can never be
 * carried by a tenant-wide setting — the reason this module still keeps a local override. */
export const DEVICE_BOUND_MODES: readonly PrintDeviceMode[] = ['web-usb', 'web-bluetooth'];

export function isDeviceBoundMode(mode: PrintDeviceMode): boolean {
  return DEVICE_BOUND_MODES.includes(mode);
}

/** Initial selection for the Settings picker on a till that has never chosen one — a hint for a
 * form, never an answer for the print path. `dispatchSilentPrint` must see `null` for "not
 * configured": when this guess was used at print time, an unconfigured desktop till claimed QZ
 * Tray it did not have, failed, and dropped to the browser dialog with nothing explaining why. */
export function suggestDefaultMode(): PrintDeviceMode {
  if (typeof navigator === 'undefined') return 'browser-dialog';
  const isAndroid = /Android/i.test(navigator.userAgent);
  return isAndroid ? 'browser-dialog' : 'qz';
}

/** This device's override, or `null` when it has never picked one. */
export function loadLocalDeviceMode(): PrintDeviceMode | null {
  try {
    const raw = localStorage.getItem(DEVICE_MODE_KEY);
    if (raw && VALID_MODES.includes(raw as PrintDeviceMode)) return raw as PrintDeviceMode;
  } catch {
    // localStorage unavailable (private browsing, etc.) — fall through to "no local override".
  }
  return null;
}

/** The transport to actually print with: this device's override first (a Bluetooth/USB pairing
 * only it has), then the tenant-wide setting, then `null` for genuinely unconfigured. */
export function resolveDeviceMode(serverMode: PrintDeviceMode | null | undefined): PrintDeviceMode | null {
  return loadLocalDeviceMode() ?? serverMode ?? null;
}

export function saveDeviceMode(mode: PrintDeviceMode): void {
  try {
    localStorage.setItem(DEVICE_MODE_KEY, mode);
  } catch {
    // Best-effort persistence — the tenant-wide setting is the durable copy, so a failed write
    // here only costs this device its override, not its ability to print.
  }
}

/** Called on logout so one account's device/printer choice never leaks into another's session on
 * a shared till — the next account's own tenant-wide mode takes over instead. */
export function clearDeviceMode(): void {
  try {
    localStorage.removeItem(DEVICE_MODE_KEY);
  } catch {
    // Nothing to clean up if storage was already unavailable.
  }
}
