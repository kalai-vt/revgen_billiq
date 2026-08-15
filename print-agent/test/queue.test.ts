import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { PrintJobQueue } from '../src/queue.js';

describe('PrintJobQueue', () => {
  let dir: string;
  let queue: PrintJobQueue;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'print-agent-queue-'));
    queue = new PrintJobQueue(join(dir, 'jobs.sqlite'));
  });

  afterEach(() => {
    queue.close();
    try {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only — see server.test.ts's afterEach for why this can race on Windows
    }
  });

  it('enqueues a new job as queued', () => {
    const { record, isNew } = queue.enqueue('job-1', 'printer-1', 'tax_invoice');
    expect(isNew).toBe(true);
    expect(record.status).toBe('queued');
    expect(record.retryCount).toBe(0);
  });

  it('rejects a duplicate printJobId as a no-op echo, never as a second job (spec §12/§26/§31)', () => {
    const first = queue.enqueue('job-2', 'printer-1', 'tax_invoice');
    queue.setStatus('job-2', 'completed');
    const second = queue.enqueue('job-2', 'printer-1', 'tax_invoice');
    expect(second.isNew).toBe(false);
    expect(second.record.status).toBe('completed');
    expect(first.record.printJobId).toBe(second.record.printJobId);
  });

  it('transitions status and persists error codes on failure', () => {
    queue.enqueue('job-3', 'printer-1', 'tax_invoice');
    queue.setStatus('job-3', 'printing');
    expect(queue.get('job-3')?.status).toBe('printing');
    queue.setStatus('job-3', 'failed', 'printer_offline');
    const record = queue.get('job-3');
    expect(record?.status).toBe('failed');
    expect(record?.errorCode).toBe('printer_offline');
  });

  it('increments retry_count and marks retrying', () => {
    queue.enqueue('job-4', 'printer-1', 'tax_invoice');
    queue.incrementRetry('job-4');
    const record = queue.get('job-4');
    expect(record?.retryCount).toBe(1);
    expect(record?.status).toBe('retrying');
  });

  it('marks jobs left queued/printing at startup as failed (agent-restarted), never silently lost', () => {
    queue.enqueue('job-5', 'printer-1', 'tax_invoice');
    queue.setStatus('job-5', 'printing');
    queue.close();

    const reopened = new PrintJobQueue(join(dir, 'jobs.sqlite'));
    const record = reopened.get('job-5');
    expect(record?.status).toBe('failed');
    expect(record?.errorCode).toBe('agent_restarted');
    reopened.close();
  });
});
