import { platform } from 'node:os';
import { describe, expect, it } from 'vitest';
import { OsPrinterAdapter } from '../src/adapters/OsPrinterAdapter.js';

// Windows-only — this adapter shells out to PowerShell's Get-Printer and (for print()) the
// pdf-to-printer/SumatraPDF binary, neither of which exists on other platforms yet (macOS is
// Phase 2 per the migration plan).
describe.skipIf(platform() !== 'win32')('OsPrinterAdapter (real Windows spooler)', () => {
  it(
    'discover() lists real printers registered on this machine',
    async () => {
      const adapter = new OsPrinterAdapter();
      const printers = await adapter.discover();
      expect(printers.length).toBeGreaterThan(0);
      for (const printer of printers) {
        expect(printer.printerId).toMatch(/^os:/);
        expect(printer.connectionType).toBe('os');
      }
    },
    // powershell.exe's own cold-start (not Get-Printer itself) dominates this call — a fresh
    // process spin-up routinely takes several seconds under load, past vitest's 5s default.
    15_000,
  );

  it(
    'print() successfully spools a real A4/PDF job to a real driver-backed printer, if one is installed',
    async () => {
      const adapter = new OsPrinterAdapter();
      const printers = await adapter.discover();
      // "Print to file" virtual printers (Microsoft Print to PDF / XPS Document Writer) need an
      // interactive save-path dialog SumatraPDF's silent mode can't supply — a confirmed Windows
      // limitation of those specific printers, not something this adapter can work around. Thermal
      // printers using a generic text-only driver (BillQuick-Go, POS58 Printer) are excluded too —
      // the product itself never sends them a PDF (paperWidth routing always sends 58mm/80mm
      // thermal documents down the raw ESC/POS path instead, see print()'s own branch), and forcing
      // one through SumatraPDF/a generic driver isn't a real scenario, just a hang waiting on
      // rendering the driver can't do. AnyDesk's virtual printer is excluded for the same
      // not-a-real-target reason. Skip entirely if this dev machine has no suitable printer left.
      const target = printers.find((p) => !/print to pdf|xps document writer|onenote|fax|billquick|pos\d|anydesk/i.test(p.name));
      if (!target) {
        console.warn('[test] No non-virtual, non-thermal printer installed on this machine — skipping print() verification.');
        return;
      }
      await expect(
        adapter.print(target.printerId, { type: 'test_print', paperWidth: 'A4' }, await adapter.getCapabilities(target.printerId)),
      ).resolves.toBeUndefined();
    },
    // Same PowerShell cold-start rationale as discover()'s own timeout override above.
    15_000,
  );

  it(
    'print() sends a real receipt as raw ESC/POS bytes to a thermal-capable printer (spec §11 core use case)',
    async () => {
      // Regression test for a real gap found during manual verification: the first version of this
      // adapter only ever handled `document.pdfBase64`, so a thermal (58mm/80mm) invoice — which
      // BillIQ always sends as `document.receipt`, never a PDF — failed outright against every OS
      // printer, since NetworkAdapter/UsbEscPosAdapter (which do handle `receipt`) have no printers
      // configured out of the box. This is the fix: OsPrinterAdapter now renders receipts to ESC/POS
      // and sends them via rawPrinter.ts's Windows spooler RAW datatype job, so a thermal printer
      // installed the ordinary Windows way (BillQuick-Go/POS58 Printer's driver, in this dev
      // environment) works with zero extra configuration. This is deliberately the one case that
      // *should* pick a thermal printer (unlike the A4/PDF test above) — it's the real use case.
      const adapter = new OsPrinterAdapter();
      const printers = await adapter.discover();
      const target = printers.find((p) => !/print to pdf|xps document writer|onenote|fax/i.test(p.name));
      if (!target) {
        console.warn('[test] No non-virtual printer installed on this machine — skipping thermal print() verification.');
        return;
      }
      const document = {
        type: 'tax_invoice' as const,
        paperWidth: '80mm' as const,
        receipt: {
          business: { companyName: 'Regression Test Co' },
          data: {
            invoiceNumber: 'REG-1',
            createdAt: new Date().toISOString(),
            cashierName: 'Test',
            items: [{ name: 'Widget', quantity: 1, unitPrice: 100, lineTotal: 100 }],
            subtotal: 100,
            discountAmount: 0,
            taxAmount: 0,
            taxPercentage: 0,
            totalAmount: 100,
            paymentMethod: 'cash',
            currency: 'INR',
            decimalPrecision: 2,
          },
        },
      };
      await expect(adapter.print(target.printerId, document, await adapter.getCapabilities(target.printerId))).resolves.toBeUndefined();
    },
    // Same PowerShell cold-start rationale as discover()'s own timeout override above.
    15_000,
  );
});
