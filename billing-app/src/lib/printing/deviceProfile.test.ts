import { beforeEach, describe, expect, it } from 'vitest';
import { clearDeviceMode, resolveDeviceMode, saveDeviceModeOverride } from '@/lib/printing/deviceProfile';

beforeEach(() => {
  localStorage.clear();
});

describe('resolveDeviceMode', () => {
  it('reports browser-dialog — never a guessed transport — when nothing is configured anywhere', () => {
    expect(resolveDeviceMode(null)).toBe('browser-dialog');
    expect(resolveDeviceMode(undefined)).toBe('browser-dialog');
  });

  it('uses the tenant-wide server value when no local override exists', () => {
    expect(resolveDeviceMode('qz')).toBe('qz');
    expect(resolveDeviceMode('revgenai-agent')).toBe('revgenai-agent');
  });

  it('prefers a local Web USB/Bluetooth override over the server value', () => {
    saveDeviceModeOverride('web-usb');
    expect(resolveDeviceMode('qz')).toBe('web-usb');
    expect(resolveDeviceMode(null)).toBe('web-usb');
  });

  it('ignores a stale/tampered localStorage value that is not an overridable mode', () => {
    localStorage.setItem('revgeniq_print_device_mode', 'qz');
    expect(resolveDeviceMode('revgenai-agent')).toBe('revgenai-agent');
  });
});

describe('saveDeviceModeOverride', () => {
  it('persists Web USB/Bluetooth as a local override', () => {
    saveDeviceModeOverride('web-bluetooth');
    expect(resolveDeviceMode(null)).toBe('web-bluetooth');
  });

  it('clears any existing override when a tenant-wide transport is chosen, so Settings changes reach this till', () => {
    saveDeviceModeOverride('web-usb');
    expect(resolveDeviceMode('qz')).toBe('web-usb');

    saveDeviceModeOverride('qz');
    expect(resolveDeviceMode('qz')).toBe('qz');
    expect(resolveDeviceMode('revgenai-agent')).toBe('revgenai-agent');
  });
});

describe('clearDeviceMode', () => {
  it('removes a saved override, falling back to the server value again', () => {
    saveDeviceModeOverride('web-usb');
    expect(resolveDeviceMode('qz')).toBe('web-usb');

    clearDeviceMode();
    expect(resolveDeviceMode('qz')).toBe('qz');
  });
});
