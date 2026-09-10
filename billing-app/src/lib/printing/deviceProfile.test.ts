import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearDeviceMode,
  isDeviceBoundMode,
  loadLocalDeviceMode,
  resolveDeviceMode,
  saveDeviceMode,
  suggestDefaultMode,
} from '@/lib/printing/deviceProfile';

const DEVICE_MODE_KEY = 'revgeniq_print_device_mode';

describe('deviceProfile — resolving which transport a till prints through', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports no local override on a till that has never picked one', () => {
    // The regression this guards: loadDeviceMode() used to fall back to suggestDefaultMode()
    // here, so an unconfigured desktop till claimed QZ Tray it did not have. dispatchSilentPrint
    // then "tried" QZ, failed, and dropped to the system print dialog with nothing explaining it.
    expect(loadLocalDeviceMode()).toBeNull();
    expect(resolveDeviceMode(null)).toBeNull();
    expect(resolveDeviceMode(undefined)).toBeNull();
  });

  it('falls back to the tenant-wide transport, so a newly set-up till can print', () => {
    // The whole point of moving the transport server-side: a second till inherits it instead of
    // showing a fully-configured Settings page with no way to reach the printer.
    expect(resolveDeviceMode('revgenai-agent')).toBe('revgenai-agent');
  });

  it('lets this device override the tenant-wide transport', () => {
    // A phone paired over Bluetooth cannot use the tenant's QZ Tray, so its own choice wins.
    saveDeviceMode('web-bluetooth');
    expect(resolveDeviceMode('qz')).toBe('web-bluetooth');
  });

  it('ignores a stored value that is not a known transport', () => {
    localStorage.setItem(DEVICE_MODE_KEY, 'carrier-pigeon');
    expect(loadLocalDeviceMode()).toBeNull();
    expect(resolveDeviceMode('qz')).toBe('qz');
  });

  it('clears the override so a shared till follows the next account tenant-wide', () => {
    saveDeviceMode('web-usb');
    clearDeviceMode();
    expect(loadLocalDeviceMode()).toBeNull();
    expect(resolveDeviceMode('revgenai-agent')).toBe('revgenai-agent');
  });

  it('treats only the pairing-bound transports as device-bound', () => {
    // QZ Tray and the Print Agent are localhost services with no per-device pairing, which is
    // why they belong to the tenant and must not pin a till to its first choice.
    expect(isDeviceBoundMode('web-usb')).toBe(true);
    expect(isDeviceBoundMode('web-bluetooth')).toBe(true);
    expect(isDeviceBoundMode('qz')).toBe(false);
    expect(isDeviceBoundMode('revgenai-agent')).toBe(false);
    expect(isDeviceBoundMode('browser-dialog')).toBe(false);
  });

  it('still offers a starting suggestion for the Settings picker', () => {
    // Kept for the form's initial selection — just never consulted at print time.
    expect(['qz', 'browser-dialog']).toContain(suggestDefaultMode());
  });
});
