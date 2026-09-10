/** Which silent-printing transport *this browser on this physical device* uses.
 *
 * `auto_print_printer_name`/`auto_print_paper_size`/`auto_print_after_checkout` are tenant-wide
 * Settings, shared across every till — and so, now, is the transport itself
 * (`settings.auto_print_device_mode`, NULL meaning never configured). The one exception is Web
 * USB/Web Bluetooth: browser pairing permissions are granted per-origin on one specific device
 * via a user gesture, so a phone's Bluetooth pairing can't be pushed from a dashboard. That choice
 * stays local, as an override kept here in localStorage (following the same convention as
 * `components/layout/sidebar/sidebarStorage.ts`) that takes precedence over the tenant-wide
 * server value on this one device only. */

export type PrintDeviceMode = 'qz' | 'revgenai-agent' | 'web-usb' | 'web-bluetooth' | 'browser-dialog';

const DEVICE_MODE_OVERRIDE_KEY = 'revgeniq_print_device_mode';

// Only these two modes are ever legitimately per-device — see the file header. A stale/tampered
// localStorage value naming any other mode is ignored rather than trusted.
const OVERRIDABLE_MODES: PrintDeviceMode[] = ['web-usb', 'web-bluetooth'];

function loadOverride(): PrintDeviceMode | null {
  try {
    const raw = localStorage.getItem(DEVICE_MODE_OVERRIDE_KEY);
    if (raw && OVERRIDABLE_MODES.includes(raw as PrintDeviceMode)) return raw as PrintDeviceMode;
  } catch {
    // localStorage unavailable (private browsing, etc.) — fall through to the server value.
  }
  return null;
}

/** Resolves the transport this device should actually use: a per-device Web USB/Bluetooth
 * override (if this till paired one), otherwise whichever transport Settings > Automatic
 * Printing has configured tenant-wide. Falls back to 'browser-dialog' — never a guessed
 * transport like 'qz' — when nothing is configured anywhere, since claiming a transport that was
 * never actually set up makes a till try (and fail) the wrong printer instead of cleanly falling
 * back to the print dialog. */
export function resolveDeviceMode(serverDeviceMode: PrintDeviceMode | null | undefined): PrintDeviceMode {
  return loadOverride() ?? serverDeviceMode ?? 'browser-dialog';
}

/** Persists this device's transport choice. QZ Tray / RevGenAI Print Agent / the browser dialog
 * are tenant-wide choices (saved to the server elsewhere, via settingsApi.updateSettings) — for
 * those, any leftover Web USB/Bluetooth override on this device is cleared, so a later transport
 * change made in Settings actually reaches this till instead of being silently shadowed by
 * whatever it paired first. */
export function saveDeviceModeOverride(mode: PrintDeviceMode): void {
  try {
    if (OVERRIDABLE_MODES.includes(mode)) {
      localStorage.setItem(DEVICE_MODE_OVERRIDE_KEY, mode);
    } else {
      localStorage.removeItem(DEVICE_MODE_OVERRIDE_KEY);
    }
  } catch {
    // Best-effort persistence — a failed write just means the picker resets next visit.
  }
}

/** Called on logout so one account's device/printer choice never leaks into another's session on
 * a shared till. */
export function clearDeviceMode(): void {
  try {
    localStorage.removeItem(DEVICE_MODE_OVERRIDE_KEY);
  } catch {
    // Nothing to clean up if storage was already unavailable.
  }
}
