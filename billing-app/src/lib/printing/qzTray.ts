import qz from 'qz-tray';
import { getCertificate, sign } from '@/lib/printing/qzTraySigning';

/** Thin wrapper around the QZ Tray browser SDK. QZ Tray is a locally-installed desktop app; when
 * it isn't running, every call here rejects and callers should fall back to the existing browser
 * print-dialog flow.
 *
 * Requests are signed (see configureSigning below) when the backend has
 * REVGENIQ_QZ_TRAY_PRIVATE_KEY/REVGENIQ_QZ_TRAY_CERTIFICATE configured. Signing gives the app a
 * stable identity, so checking "Remember this decision" on QZ Tray's one-time trust prompt
 * actually persists across future sessions — without it, QZ Tray treats every connection as a
 * new anonymous identity and re-prompts on every single print. When those env vars aren't set,
 * qzTraySigning's calls resolve to an empty string and QZ Tray falls back to today's unsigned
 * behavior (still fully functional, just re-prompts each time). */

export class QzTrayError extends Error {}

let signingConfigured = false;

function configureSigning(): void {
  if (signingConfigured) return;
  signingConfigured = true;
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setCertificatePromise((resolve: (cert: string) => void, reject: (err: unknown) => void) => {
    getCertificate().then(resolve, reject);
  });
  qz.security.setSignaturePromise((toSign: string) => (resolve: (sig: string) => void, reject: (err: unknown) => void) => {
    sign(toSign).then(resolve, reject);
  });
}

function isActive(): boolean {
  try {
    return Boolean(qz.websocket.isActive());
  } catch {
    return false;
  }
}

let connecting: Promise<void> | null = null;

async function connectOnce(): Promise<void> {
  configureSigning();
  try {
    await qz.websocket.connect();
  } catch (err) {
    throw new QzTrayError(
      err instanceof Error && err.message
        ? err.message
        : 'Could not connect to QZ Tray. Is it installed and running on this computer?',
    );
  }
}

/** Connects to the local QZ Tray instance, reusing an in-flight/active connection if present. */
export async function connect(timeoutMs = 4000): Promise<void> {
  if (isActive()) return;
  if (!connecting) {
    connecting = connectOnce().finally(() => {
      connecting = null;
    });
  }
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new QzTrayError('Timed out connecting to QZ Tray.')), timeoutMs);
  });
  await Promise.race([connecting, timeout]);
}

/** Resolves true/false rather than throwing — use this to decide whether to offer silent
 * printing at all (e.g. before wiring up auto-print at checkout). */
export async function isAvailable(timeoutMs = 2500): Promise<boolean> {
  try {
    await connect(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

export async function listPrinters(): Promise<string[]> {
  await connect();
  const printers = await qz.printers.find();
  return Array.isArray(printers) ? printers : [printers];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error ?? new QzTrayError('Could not read PDF for printing.'));
    reader.readAsDataURL(blob);
  });
}

/** Prints a PDF blob to the given printer, silently and with no dialog. The PDF is expected to
 * already be sized/laid out per the tenant's Invoice Designer template (see
 * `invoice-designer/pdf_renderer.py`) — this function prints it as-is at its own page size so
 * the Designer configuration is honored regardless of which physical printer is selected. */
export async function printPdf(printerName: string, pdf: Blob): Promise<void> {
  if (!printerName) throw new QzTrayError('No printer is configured for automatic printing.');
  await connect();
  const data = await blobToBase64(pdf);
  const config = qz.configs.create(printerName);
  await qz.print(config, [{ type: 'pdf', format: 'base64', data }]);
}

/** Sends raw ESC/POS command/text fragments straight to the printer's OS print queue, bypassing
 * any driver rendering. This is what makes silent thermal printing work uniformly across USB,
 * network (LAN/WiFi), and Bluetooth printers: once a printer is installed/paired with the OS
 * (a one-time, standard OS-level step — not an app install), it shows up as a normal print
 * queue to QZ Tray regardless of its physical connection. Build `commands` with
 * `buildReceiptCommands` from `lib/printing/escpos`. */
export async function printRaw(printerName: string, commands: string[]): Promise<void> {
  if (!printerName) throw new QzTrayError('No printer is configured for automatic printing.');
  await connect();
  const config = qz.configs.create(printerName);
  await qz.print(config, commands);
}
