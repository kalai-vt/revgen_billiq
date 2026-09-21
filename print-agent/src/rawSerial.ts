/** Writes raw bytes to a Bluetooth-paired thermal printer's SPP (Serial Port Profile) virtual COM
 * port. Windows already exposes a paired Bluetooth printer as a "Standard Serial over Bluetooth
 * link (COMn)" port with zero extra pairing/driver work, so this needs no native serial-port npm
 * dependency (the class of native-module risk `usb` already carries, per UsbEscPosAdapter's own
 * comment) — PowerShell's built-in `System.IO.Ports.SerialPort` (available on Windows PowerShell
 * 5.1 without `Add-Type`, confirmed empirically against real hardware) does the actual write,
 * hosted the same way `rawPrinter.ts` hosts its own P/Invoke script for the Windows-spooler path. */

import { spawn } from 'node:child_process';

// The de facto standard SPP baud rate for commodity ESC/POS Bluetooth thermal printers — confirmed
// working against real hardware (BillQuick-Go) during Phase 1 verification. Not user-configurable
// yet; if a printer needs a different rate, this is the one place to make it so.
const BAUD_RATE = 9600;

const SERIAL_WRITE_SCRIPT = `
$comPort = $env:REVGENAI_SERIAL_PORT_TARGET
$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
$port = New-Object System.IO.Ports.SerialPort($comPort, ${BAUD_RATE}, 'None', 8, 'One')
$port.WriteTimeout = 5000
$port.Open()
try {
  $port.Write($bytes, 0, $bytes.Length)
  Start-Sleep -Milliseconds 300
} finally {
  $port.Close()
}
`;

/** Raised when the printer is paired but never answers — see PRINT_TIMEOUT_MS. Distinct from a
 * non-zero exit so callers can tell "nobody home" apart from "the write itself was rejected". */
export class SerialPrintTimeoutError extends Error {}

/** Ceiling on the whole spawn → Open() → Write() → close cycle.
 *
 * `$port.WriteTimeout` in the script above only governs I/O once the port is already open;
 * `$port.Open()` itself is unbounded, because System.IO.Ports.SerialPort exposes no
 * connect-timeout property. A Bluetooth printer that is paired but powered off or out of range
 * therefore blocks in Open() indefinitely, powershell.exe never exits, and this promise never
 * settles — which matters because server.ts `await`s adapter.print(), so one printer switched off
 * at the counter stalls every job queued behind it. The queue's retry_count path never engages
 * either, since the job never fails, it just never finishes. Bounding it here turns a dead printer
 * into an ordinary job failure that the existing retry logic can act on.
 *
 * Sized to clear powershell.exe's own multi-second cold start (the same cost osPrinterAdapter's
 * tests budget 15s for) plus a slow SPP link and the script's 5s WriteTimeout. Mirrors
 * NetworkAdapter's precedent of bounding every socket operation explicitly. */
const PRINT_TIMEOUT_MS = 12_000;

/** Spawns the PowerShell helper above, passing the COM port name via an environment variable
 * (never string-interpolated into the script — mirrors rawPrinter.ts's printer-name handling for
 * the same injection-safety reason) and the bytes over stdin as base64. */
export function sendRawBytesToComPort(comPort: string, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SERIAL_WRITE_SCRIPT], {
      windowsHide: true,
      env: { ...process.env, REVGENAI_SERIAL_PORT_TARGET: comPort },
    });
    let stderr = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    // Guards every exit path: whichever of timeout/error/close fires first wins, and the loser is
    // a no-op. Without this, killing the child on timeout would immediately re-enter via 'close'.
    const settle = (act: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      act();
    };

    timer = setTimeout(() => {
      settle(() => {
        child.kill();
        reject(
          new SerialPrintTimeoutError(
            `Bluetooth serial print to "${comPort}" timed out after ${PRINT_TIMEOUT_MS}ms — the printer is paired but not responding (powered off, or out of range).`,
          ),
        );
      });
    }, PRINT_TIMEOUT_MS);

    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', (err) => settle(() => reject(err)));
    child.on('close', (code) => {
      settle(() => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `Bluetooth serial print to "${comPort}" failed (exit ${code}).`));
      });
    });
    child.stdin.write(Buffer.from(bytes).toString('base64'));
    child.stdin.end();
  });
}
