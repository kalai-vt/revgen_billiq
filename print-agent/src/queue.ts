/** Local, persisted print job queue (spec §12). SQLite rather than in-memory so a job's status
 * survives an agent restart — if the agent crashes mid-print, the next start-up can see the job
 * was left `printing` and surface it as `failed` instead of silently losing it. This is also the
 * dedupe store for replay/duplicate-print protection (spec §12/§31): `enqueue()` is a no-op (and
 * returns the existing record) if `printJobId` was already seen, regardless of how much time has
 * passed — a real invoice's print_job_id should never be reused by a legitimate second job. */

import Database from 'better-sqlite3';
import type { PrintJobRecord, PrintJobStatus } from './types.js';

export class PrintJobQueue {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS print_jobs (
        print_job_id TEXT PRIMARY KEY,
        printer_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        status TEXT NOT NULL,
        error_code TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    // A job that was left `printing`/`queued` when the process last exited didn't finish — surface
    // it as failed rather than pretending it's still in flight (spec §26: never mark a job
    // successful unless the agent actually received a successful printer response).
    this.db
      .prepare(`UPDATE print_jobs SET status = 'failed', error_code = 'agent_restarted', updated_at = ? WHERE status IN ('queued','printing')`)
      .run(new Date().toISOString());
  }

  /** Returns `{ record, isNew: false }` without inserting anything if this printJobId was already
   * seen — the caller (server.ts) uses `isNew` to decide whether to actually run the print or just
   * echo back the existing job's status. */
  enqueue(printJobId: string, printerId: string, documentType: string): { record: PrintJobRecord; isNew: boolean } {
    const existing = this.get(printJobId);
    if (existing) return { record: existing, isNew: false };
    const now = new Date().toISOString();
    this.db
      .prepare(`INSERT INTO print_jobs (print_job_id, printer_id, document_type, status, retry_count, created_at, updated_at)
                VALUES (?, ?, ?, 'queued', 0, ?, ?)`)
      .run(printJobId, printerId, documentType, now, now);
    return { record: this.get(printJobId)!, isNew: true };
  }

  setStatus(printJobId: string, status: PrintJobStatus, errorCode?: string | null): void {
    this.db
      .prepare(`UPDATE print_jobs SET status = ?, error_code = ?, updated_at = ? WHERE print_job_id = ?`)
      .run(status, errorCode ?? null, new Date().toISOString(), printJobId);
  }

  incrementRetry(printJobId: string): void {
    this.db
      .prepare(`UPDATE print_jobs SET retry_count = retry_count + 1, status = 'retrying', updated_at = ? WHERE print_job_id = ?`)
      .run(new Date().toISOString(), printJobId);
  }

  get(printJobId: string): PrintJobRecord | null {
    const row = this.db.prepare(`SELECT * FROM print_jobs WHERE print_job_id = ?`).get(printJobId) as
      | {
          print_job_id: string;
          printer_id: string;
          document_type: string;
          status: PrintJobStatus;
          error_code: string | null;
          retry_count: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      printJobId: row.print_job_id,
      printerId: row.printer_id,
      documentType: row.document_type as PrintJobRecord['documentType'],
      status: row.status,
      errorCode: row.error_code,
      retryCount: row.retry_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  close(): void {
    this.db.close();
  }
}
