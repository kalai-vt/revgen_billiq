/** Persistent file logging. The agent normally runs with no attached console (`launcher.vbs`
 * starts it hidden via `WshShell.Run(..., 0, False)` for the Start Menu/Startup shortcuts) — every
 * `console.*` call in that mode goes nowhere, so a real-world failure (e.g. a printer that
 * intermittently drops out of discovery) leaves no trace to debug from. This mirrors console.*
 * output to `agent.log` in the config dir as well, so `error`/`warn` survive a hidden run. */

import { appendFileSync, existsSync, statSync, truncateSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { configDir, logPath } from './config.js';

const MAX_LOG_BYTES = 2 * 1024 * 1024; // 2MB — plenty for a local device log, never grows unbounded

function write(level: string, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${args
    .map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}\n`;
  try {
    const dir = configDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = logPath();
    if (existsSync(path) && statSync(path).size > MAX_LOG_BYTES) truncateSync(path, 0);
    appendFileSync(path, line, 'utf8');
  } catch {
    // Logging must never crash the agent — if the disk write fails there's nothing more to do.
  }
}

export const logger = {
  info(...args: unknown[]): void {
    console.log(...args);
    write('info', args);
  },
  warn(...args: unknown[]): void {
    console.warn(...args);
    write('warn', args);
  },
  error(...args: unknown[]): void {
    console.error(...args);
    write('error', args);
  },
};
