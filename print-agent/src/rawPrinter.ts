/** Sends raw bytes (ESC/POS commands) straight to a Windows-installed printer's spooler queue as
 * a RAW datatype job — bypassing the printer driver's own rendering entirely, the same technique
 * QZ Tray itself uses for thermal printers. This is what makes a thermal printer installed the
 * ordinary Windows way (Settings > Printers, whether it's plugged in via USB, shared over the
 * network, or anything else the driver handles) usable for real ESC/POS receipts without the
 * customer needing to separately tell this agent the printer's raw host:port or USB IDs — for the
 * common case (a thermal printer with a Windows driver), this is the only path that's needed;
 * NetworkAdapter/UsbEscPosAdapter (address-based, no OS driver involved) remain for printers that
 * were never installed as a Windows printer at all.
 *
 * Implemented via a PowerShell-hosted P/Invoke into winspool.drv (OpenPrinter/StartDocPrinter/
 * WritePrinter/EndDocPrinter) — the standard "RawPrinterHelper" pattern many Windows POS tools use
 * — rather than a native npm module, keeping this dependency-free the same way secureStorage.ts's
 * DPAPI calls and OsPrinterAdapter's Get-Printer discovery already are.
 */

import { spawn } from 'node:child_process';

const RAW_PRINT_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RevGenAIRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In] DOCINFOA di);
  [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static void SendBytesToPrinter(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    DOCINFOA di = new DOCINFOA();
    di.pDocName = "RevGenAI Print Agent Receipt";
    di.pDataType = "RAW";
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
      throw new Exception("OpenPrinter failed for '" + printerName + "' (error " + Marshal.GetLastWin32Error() + ")");
    }
    try {
      if (!StartDocPrinter(hPrinter, 1, di)) {
        throw new Exception("StartDocPrinter failed (error " + Marshal.GetLastWin32Error() + ")");
      }
      try {
        if (!StartPagePrinter(hPrinter)) throw new Exception("StartPagePrinter failed (error " + Marshal.GetLastWin32Error() + ")");
        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        try {
          Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
          int written;
          if (!WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written) || written != bytes.Length) {
            throw new Exception("WritePrinter wrote " + written + " of " + bytes.Length + " bytes (error " + Marshal.GetLastWin32Error() + ")");
          }
        } finally {
          Marshal.FreeCoTaskMem(pUnmanagedBytes);
        }
        EndPagePrinter(hPrinter);
      } finally {
        EndDocPrinter(hPrinter);
      }
    } finally {
      ClosePrinter(hPrinter);
    }
  }
}
"@

$printerName = $env:REVGENAI_RAW_PRINT_TARGET
$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
[RevGenAIRawPrint]::SendBytesToPrinter($printerName, $bytes)
`;

export class RawPrintError extends Error {}

/** Spawns the PowerShell helper above, passing the printer name via an environment variable
 * (never string-interpolated into the script — a printer name containing quote characters would
 * otherwise be a command-injection vector) and the bytes over stdin as base64, mirroring
 * secureStorage.ts's existing stdin-piping convention for the same reason: no argv length limits,
 * no shell-escaping to get wrong. */
export function sendRawBytesToPrinter(printerName: string, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', RAW_PRINT_SCRIPT], {
      windowsHide: true,
      env: { ...process.env, REVGENAI_RAW_PRINT_TARGET: printerName },
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new RawPrintError(stderr.trim() || `Raw print to "${printerName}" failed (exit ${code}).`));
    });
    child.stdin.write(Buffer.from(bytes).toString('base64'));
    child.stdin.end();
  });
}
