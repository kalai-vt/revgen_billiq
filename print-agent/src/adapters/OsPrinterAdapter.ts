/** OS-print adapter — the one adapter that has real printers on a typical customer machine
 * without any extra configuration, since it lists whatever Windows already knows about (via
 * `Get-Printer`). It handles two genuinely different jobs depending on paper width:
 *
 * - **Thermal (58mm/80mm)**: renders the receipt via the same `buildReceiptCommands` ESC/POS
 *   logic NetworkAdapter/UsbEscPosAdapter use, then sends those raw bytes straight to the
 *   Windows-installed printer's spooler as a RAW datatype job (`rawPrinter.ts`) — bypassing the
 *   driver's own rendering entirely, the same technique QZ Tray itself uses for thermal printers.
 *   This is what makes a thermal printer installed the ordinary Windows way (whether it's reached
 *   over USB, a network share, or anything else the driver handles) usable for real receipts
 *   without the customer separately telling this agent the printer's raw host:port or USB IDs —
 *   for the common case, this OS path is the *only* one that's needed; NetworkAdapter/
 *   UsbEscPosAdapter remain for printers that were never installed as a Windows printer at all.
 * - **Everything else (A4/A5/Letter/Legal)**: hands a pre-rendered PDF (built server-side by the
 *   existing `invoice_designer/pdf_renderer.py`, same as today's `qzTray.printPdf` path) to
 *   `pdf-to-printer` (bundles SumatraPDF for silent/no-dialog printing — there's no built-in Node
 *   API for this). If that's not installed/available, `print()` throws a clear "not available"
 *   error rather than silently no-opping (spec §25); `discover()` still works either way.
 *
 * Both paths were verified end-to-end against real printers installed on this dev machine — see
 * `test/osPrinterAdapter.test.ts`. macOS (CUPS `lp`/`lpr`) is Phase 2 per the migration plan; the
 * interface is identical, only the shell-out target changes.
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import type { PrinterAdapter, PrinterCapabilities, PrinterInfo, PrintDocument } from '../types.js';
import { buildTestPrintPdfBase64 } from '../renderer/testPdf.js';
import { buildReceiptCommands, buildTestPrintCommands, toBytes, type ReceiptBusinessInfo, type ReceiptData } from '../renderer/escpos.js';
import { sendRawBytesToPrinter } from '../rawPrinter.js';

function isThermalPaperWidth(paperWidth: PrintDocument['paperWidth']): paperWidth is '58mm' | '80mm' {
  return paperWidth === '58mm' || paperWidth === '80mm';
}

const OS_CAPABILITIES: PrinterCapabilities = { cut: false, cashDrawer: false, qrCode: false, barcode: false, logo: false };

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `powershell exited with code ${code}`));
    });
  });
}

export class OsPrinterAdapter implements PrinterAdapter {
  readonly connectionType = 'os' as const;

  async discover(): Promise<PrinterInfo[]> {
    if (platform() !== 'win32') {
      throw new Error('OsPrinterAdapter currently only implements Windows discovery — macOS support is Phase 2.');
    }
    const json = await runPowerShell('Get-Printer | Select-Object Name, PrinterStatus | ConvertTo-Json -Compress');
    if (!json) return [];
    const parsed = JSON.parse(json) as { Name: string; PrinterStatus: number } | Array<{ Name: string; PrinterStatus: number }>;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((row) => ({
      printerId: `os:${row.Name}`,
      name: row.Name,
      brand: 'OS',
      model: row.Name,
      connectionType: 'os' as const,
      paperWidth: 'A4' as const,
      // PrinterStatus 0 == Normal in the Get-Printer enum; anything else surfaces as an error
      // state rather than silently reporting "connected" (spec §25).
      status: row.PrinterStatus === 0 ? ('connected' as const) : ('error' as const),
      role: 'receipt' as const,
      capabilities: OS_CAPABILITIES,
    }));
  }

  async connect(): Promise<void> {
    // The OS spooler has no persistent "connection" to hold open — each print() is one spool job.
  }

  async disconnect(): Promise<void> {}

  async getStatus(printerId: string): Promise<PrinterInfo['status']> {
    const printers = await this.discover();
    return printers.find((p) => p.printerId === printerId)?.status ?? 'unknown';
  }

  async print(printerId: string, document: PrintDocument): Promise<void> {
    const name = printerId.startsWith('os:') ? printerId.slice(3) : printerId;

    if (isThermalPaperWidth(document.paperWidth)) {
      const commands =
        document.type === 'test_print'
          ? buildTestPrintCommands(document.paperWidth)
          : document.receipt
            ? buildReceiptCommands(
                (document.receipt as { business: ReceiptBusinessInfo }).business,
                (document.receipt as { data: ReceiptData }).data,
                document.paperWidth,
              )
            : null;
      if (!commands) {
        throw new Error(`Printer ${printerId} was sent a thermal document with no receipt payload.`);
      }
      try {
        await sendRawBytesToPrinter(name, toBytes(commands));
      } catch (err) {
        throw new Error(
          `Printing to "${name}" failed. Check that it's a real thermal printer connected and turned on — "print to file" printers (Microsoft Print to PDF, XPS) don't accept raw receipt data. (${err instanceof Error ? err.message.split('\n')[0] : 'unknown error'})`,
        );
      }
      return;
    }

    const pdfBase64 = document.type === 'test_print' ? buildTestPrintPdfBase64(document.paperWidth) : document.pdfBase64;
    if (!pdfBase64) {
      throw new Error(`OsPrinterAdapter only supports the PDF path for non-thermal paper sizes — printer ${printerId} was sent a document with no pdfBase64 payload.`);
    }
    let printPdf: (path: string, options?: Record<string, unknown>) => Promise<void>;
    try {
      // pdf-to-printer is CommonJS; dynamic import() from ESM lands its named exports under
      // `.default` rather than on the module namespace itself — confirmed empirically, since this
      // package ships no ESM build and Node's CJS/ESM interop only synthesizes named exports for
      // packages that declare themselves as CJS via static analysis, which a `.default`-wrapped
      // dynamic import bypasses.
      const mod = (await import('pdf-to-printer')) as unknown as { default: { print: typeof printPdf } };
      printPdf = mod.default.print;
    } catch {
      throw new Error('Print Agent is not able to print PDFs on this machine: the pdf-to-printer helper is not installed.');
    }
    const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'revgenai-print-'));
    const path = join(dir, 'document.pdf');
    try {
      await writeFile(path, Buffer.from(pdfBase64, 'base64'));
      await printPdf(path, { printer: name });
    } catch (err) {
      // pdf-to-printer's own error is a raw "Command failed: <full SumatraPDF invocation>" — not
      // something spec §25's failure messages should surface verbatim to a cashier. The most
      // common real-world cause is a "print to file" virtual printer (Microsoft Print to PDF /
      // XPS Document Writer) that needs an interactive save-path prompt SumatraPDF's silent mode
      // can't supply — confirmed by reproducing this exact failure directly against Windows'
      // built-in "Microsoft Print to PDF" printer during Phase 1 verification.
      throw new Error(
        `Printing to "${name}" failed. If this is a "print to file" printer (e.g. Microsoft Print to PDF), choose a real printer instead — those require a save dialog this agent cannot supply. (${err instanceof Error ? err.message.split('\n')[0] : 'unknown error'})`,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async cancel(): Promise<void> {
    // Cancelling an already-spooled OS job would need the spooler job id, which pdf-to-printer
    // doesn't expose — documented gap, not silently pretended to work.
    throw new Error('Cancelling an OS print job in progress is not supported yet.');
  }

  async openCashDrawer(): Promise<void> {
    throw new Error('This printer has no cash drawer support (OS-print path).');
  }

  async cutPaper(): Promise<void> {
    throw new Error('This printer has no paper-cut support (OS-print path).');
  }

  async getCapabilities(): Promise<PrinterCapabilities> {
    return OS_CAPABILITIES;
  }
}
