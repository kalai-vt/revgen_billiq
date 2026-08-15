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
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Bluetooth serial print to "${comPort}" failed (exit ${code}).`));
    });
    child.stdin.write(Buffer.from(bytes).toString('base64'));
    child.stdin.end();
  });
}
