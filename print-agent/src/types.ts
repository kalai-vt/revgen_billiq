/** Shared types for the RevGenAI Print Agent. This file is the contract every other module in
 * the agent (queue, adapters, server) programs against, and it mirrors the shapes documented in
 * the print-agent redesign plan so the eventual `@revgenai/print-agent-sdk` browser client and
 * this process agree on the wire format without either side guessing. */

export type Platform = 'windows' | 'macos' | 'android';

export type PaperWidth = '58mm' | '76mm' | '80mm' | '110mm' | 'A4' | 'A5' | 'custom';

export type PrintDocumentType = 'tax_invoice' | 'credit_note' | 'provisional_bill' | 'kot' | 'test_print';

/** What BillIQ/SalesIQ actually send over the wire. `template`/`data` mirror the existing Invoice
 * Designer `InvoiceTemplateConfig`/`PreviewData` shapes on the web app side — this agent doesn't
 * need to understand their internals beyond what the ESC/POS renderer reads off `data` (see
 * `renderer/escpos.ts`'s `ReceiptData`, itself ported from billing-app's own `escpos.ts`). For the
 * non-thermal path, `pdfBase64` carries an already-rendered PDF (produced server-side by the
 * existing `invoice_designer/pdf_renderer.py`) — the agent never generates PDFs itself.
 */
export interface PrintDocument {
  type: PrintDocumentType;
  paperWidth: PaperWidth;
  /** Present for the thermal (ESC/POS) path — omitted when `pdfBase64` is used instead. */
  receipt?: unknown;
  /** Present for `type: 'kot'` — a kitchen ticket carries its own shape (no prices, no totals),
   * see `renderer/escpos.ts`'s `KotTicketData`. */
  kot?: unknown;
  /** Present for the OS-print (A4/A5/letter, or a thermal printer's own PDF driver) path. */
  pdfBase64?: string;
}

export interface PrintJobRequest {
  printJobId: string;
  printerId: string;
  document: PrintDocument;
  options?: {
    copies?: number;
    openCashDrawer?: boolean;
  };
}

export type PrintJobStatus = 'queued' | 'printing' | 'completed' | 'failed' | 'cancelled' | 'retrying';

export interface PrintJobRecord {
  printJobId: string;
  printerId: string;
  documentType: PrintDocumentType;
  status: PrintJobStatus;
  errorCode: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ConnectionType = 'usb' | 'bluetooth' | 'network' | 'os';

export type PrinterRole = 'receipt' | 'kitchen' | 'bar' | 'label' | 'customer_display' | 'other';

export interface PrinterCapabilities {
  cut: boolean;
  cashDrawer: boolean;
  qrCode: boolean;
  barcode: boolean;
  logo: boolean;
}

export interface PrinterInfo {
  printerId: string;
  name: string;
  brand: string;
  model: string;
  connectionType: ConnectionType;
  paperWidth: PaperWidth;
  status: 'connected' | 'disconnected' | 'error' | 'unknown';
  role: PrinterRole;
  capabilities: PrinterCapabilities;
}

/** The standard interface every transport implements (spec §7/§9) — the agent's job-runner code
 * never branches on connection type; it just calls these methods on whichever adapter owns the
 * target printerId. New protocols (a proprietary brand, a future OS) are added by writing one more
 * class that implements this, never by touching the job-runner or the web app. */
export interface PrinterAdapter {
  readonly connectionType: ConnectionType;
  discover(): Promise<PrinterInfo[]>;
  connect(printerId: string): Promise<void>;
  disconnect(printerId: string): Promise<void>;
  getStatus(printerId: string): Promise<PrinterInfo['status']>;
  print(printerId: string, document: PrintDocument, capabilities: PrinterCapabilities): Promise<void>;
  cancel(printerId: string, printJobId: string): Promise<void>;
  openCashDrawer(printerId: string): Promise<void>;
  cutPaper(printerId: string): Promise<void>;
  getCapabilities(printerId: string): Promise<PrinterCapabilities>;
}

export interface AgentStatus {
  agentVersion: string;
  platform: Platform;
  paired: boolean;
  deviceId: string | null;
  printers: PrinterInfo[];
}

/** The signed payload the backend's `POST /api/printing/agent/session-token` issues (see
 * `backend/app/modules/printing/router.py`) and this agent verifies locally in `tokenVerify.ts` —
 * field names AND types must match that endpoint's JSON exactly. `issued_at`/`expires_at` are
 * Unix seconds (not ISO strings, not milliseconds) — confirmed against the actual backend
 * implementation. */
export interface SessionTokenPayload {
  device_id: string;
  tenant_id: string;
  user_id: string;
  issued_at: number;
  expires_at: number;
}
