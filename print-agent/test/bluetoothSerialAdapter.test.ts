import { describe, expect, it } from 'vitest';
import { platform } from 'node:os';
import { BluetoothSerialAdapter, extractMac, extractComPort } from '../src/adapters/BluetoothSerialAdapter.js';

describe('extractMac', () => {
  it('extracts the MAC from a Bluetooth device instance id', () => {
    expect(extractMac('BTHENUM\\DEV_DC0D51060B29\\7&4163085&1&BLUETOOTHDEVICE_DC0D51060B29')).toBe('DC0D51060B29');
  });

  it('extracts the MAC from an SPP port instance id', () => {
    expect(extractMac('BTHENUM\\{00001101-0000-1000-8000-00805F9B34FB}_LOCALMFG&0002\\7&327CAC70&0&DC0D51060B29_C00000000')).toBe(
      'DC0D51060B29',
    );
  });

  it('takes the last 12-hex-digit run, not the SPP service UUID that appears earlier in the string', () => {
    // Regression test: an earlier version took the *first* match, which is the standard Bluetooth
    // SPP UUID's own hex digits (00805F9B34FB) rather than the real device MAC after it — this
    // caused discover() to bind the wrong COM port to a printer's name against real hardware.
    expect(
      extractMac('BTHENUM\\{00001101-0000-1000-8000-00805F9B34FB}_LOCALMFG&0000\\7&327CAC70&0&000000000000_00000002'),
    ).toBe('000000000000');
  });

  it('returns null when no 12-hex-digit run is present at all', () => {
    expect(extractMac('BTHENUM\\no-mac-here')).toBeNull();
  });
});

describe('extractComPort', () => {
  it('extracts the COM port number from the friendly name', () => {
    expect(extractComPort('Standard Serial over Bluetooth link (COM7)')).toBe('COM7');
  });

  it('returns null when the friendly name has no COM port suffix', () => {
    expect(extractComPort('Some other device')).toBeNull();
  });
});

// Windows-only, real-hardware — mirrors osPrinterAdapter.test.ts's posture: this exercises actual
// PowerShell/CIM discovery and (for the print test) a real Bluetooth SPP write, skipped everywhere
// this exact paired device isn't available rather than failing the suite.
describe.skipIf(platform() !== 'win32')('BluetoothSerialAdapter (real Windows Bluetooth)', () => {
  it('discover() lists paired Bluetooth printers as bt:COMn, if any are paired', async () => {
    const adapter = new BluetoothSerialAdapter();
    const printers = await adapter.discover();
    for (const printer of printers) {
      expect(printer.printerId).toMatch(/^bt:COM\d+$/);
      expect(printer.connectionType).toBe('bluetooth');
    }
  }, 15_000);

  it('print() sends a real test print over Bluetooth SPP, if a printer is paired', async () => {
    // discover() surfaces every *named*, SPP-paired Bluetooth device (matching OsPrinterAdapter's
    // own precedent of listing every OS printer, Fax/PDF/etc included, and trusting the UI-level
    // printer picker to pick the real one) — so this deliberately targets the actual printer by
    // name rather than assuming index 0, since other paired devices (headphones, speakers) show up
    // in the same list and would otherwise make this test flaky depending on pairing order.
    const adapter = new BluetoothSerialAdapter();
    const printers = await adapter.discover();
    const target = printers.find((p) => /billquick|pos|printer|thermal/i.test(p.name));
    if (!target) {
      console.warn('[test] No Bluetooth printer paired on this machine — skipping print() verification.');
      return;
    }
    // "Paired" only means Windows still remembers the device — not that it is switched on and in
    // range. An unreachable printer is therefore the same opportunistic skip as none being paired
    // at all, and must not be reported as a code failure. Any other error still fails the test.
    //
    // Matched on message rather than error type because print() deliberately re-wraps whatever
    // came back into one operator-facing message. Two shapes mean "the link never came up": the
    // Windows SPP driver's own failure on $port.Open() (usually "The semaphore timeout period has
    // expired", once the printer has been off long enough for it to give up), and rawSerial.ts's
    // PRINT_TIMEOUT_MS backstop for the stacks where Open() never returns at all. A genuine
    // defect — an unrenderable document, a bad paper width — reports differently and still fails.
    const UNREACHABLE = /timed out after|semaphore timeout|calling "Open"|device is not ready|access is denied/i;
    try {
      await expect(
        adapter.print(target.printerId, { type: 'test_print', paperWidth: '58mm' }, await adapter.getCapabilities(target.printerId)),
      ).resolves.toBeUndefined();
    } catch (err) {
      const message = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err);
      if (!UNREACHABLE.test(message)) throw err;
      console.warn(`[test] "${target.name}" is paired but did not respond (powered off, or out of range) — skipping print() verification.`);
    }
    // Must exceed rawSerial.ts's own PRINT_TIMEOUT_MS, so that its timeout fires first and is
    // observable here as a rejection, instead of vitest killing the test at the same moment.
  }, 20_000);
});
