/** Which silent-printing transport *this browser on this physical device* uses. Unlike
 * `auto_print_after_checkout`/`auto_print_paper_size` (tenant-wide Settings, shared across every
 * till), the transport itself can't be a shared setting once Web Bluetooth/Web USB are involved —
 * browser pairing permissions are granted per-origin on one specific device via a user gesture,
 * so a phone's Bluetooth pairing can't be pushed from a dashboard. This is stored locally instead,
 * following the same convention as `components/layout/sidebar/sidebarStorage.ts`. */

export type PrintDeviceMode = 'qz' | 'web-usb' | 'web-bluetooth' | 'browser-dialog';

const DEVICE_MODE_KEY = 'revgeniq_print_device_mode';

const VALID_MODES: PrintDeviceMode[] = ['qz', 'web-usb', 'web-bluetooth', 'browser-dialog'];

/** Best-effort default suggestion only — every mode stays selectable regardless of this guess
 * (e.g. a Chromebook or a mouse-driven Android device shouldn't be blocked from picking QZ). */
function suggestDefaultMode(): PrintDeviceMode {
  if (typeof navigator === 'undefined') return 'browser-dialog';
  const isAndroid = /Android/i.test(navigator.userAgent);
  return isAndroid ? 'browser-dialog' : 'qz';
}

export function loadDeviceMode(): PrintDeviceMode {
  try {
    const raw = localStorage.getItem(DEVICE_MODE_KEY);
    if (raw && VALID_MODES.includes(raw as PrintDeviceMode)) return raw as PrintDeviceMode;
  } catch {
    // localStorage unavailable (private browsing, etc.) — fall through to the default guess.
  }
  return suggestDefaultMode();
}

export function saveDeviceMode(mode: PrintDeviceMode): void {
  try {
    localStorage.setItem(DEVICE_MODE_KEY, mode);
  } catch {
    // Best-effort persistence — a failed write just means the picker resets next visit.
  }
}

/** Called on logout/login so one account's device/printer choice never leaks into another's
 * session on a shared till. */
export function clearDeviceMode(): void {
  try {
    localStorage.removeItem(DEVICE_MODE_KEY);
  } catch {
    // Nothing to clean up if storage was already unavailable.
  }
}
