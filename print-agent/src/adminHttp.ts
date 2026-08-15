/** Small local HTTP surface for the two things a person (not the browser SDK) needs to do
 * directly against the agent: enter a pairing code, and fire a test print (spec §15's "Test
 * Print" action). Deliberately a *separate* port from the WS API — this is the one thing in the
 * agent that intentionally accepts an unauthenticated request, since pairing is how auth material
 * gets established in the first place, so it must never share a port/origin-check path with the
 * browser-facing WS server (see server.ts's comment on why pairing can't go through that socket).
 * Bound to 127.0.0.1 only — never reachable from the network, only from this machine. `tray.ts`
 * opens this in the default browser rather than the agent needing its own native dialog toolkit. */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AgentConfig } from './config.js';
import { pairDevice, PairingError } from './pairing.js';
import type { PrinterRegistry } from './registry.js';
import { logger } from './log.js';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function html(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>RevGenAI Print Agent</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1c2420}
input{font-size:1.1rem;padding:.5rem;width:100%;box-sizing:border-box}button{font-size:1rem;padding:.5rem 1rem;margin-top:.75rem}</style>
</head><body>${body}</body></html>`;
}

export interface AdminHttpDeps {
  config: AgentConfig;
  registry: PrinterRegistry;
  onPaired?: (deviceId: string) => void;
}

export function createAdminHttpServer(deps: AdminHttpDeps) {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        html(`<h1>RevGenAI Print Agent</h1>
<p>Status: ${deps.config.deviceId ? 'Paired ✓' : 'Not paired'}</p>
${deps.config.deviceId ? `<p>Device ID: <code>${deps.config.deviceId}</code></p>` : '<p><a href="/pair">Enter a pairing code</a></p>'}
<p><a href="/test-print">Run a test print</a></p>`),
      );
      return;
    }

    if (url.pathname === '/pair' && req.method === 'GET') {
      // Settings > Hardware & Printing opens this page as `/pair?code=123456` so the user only
      // has to click Pair once, instead of copying a 6-digit code from one window into another —
      // still a real, deliberate click (not auto-submitted), so a stray link/bookmark can't
      // silently pair a device on page load.
      const prefill = /^\d{0,6}$/.test(url.searchParams.get('code') ?? '') ? (url.searchParams.get('code') ?? '') : '';
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        html(`<h1>Pair this device</h1>
<p>Enter the pairing code shown in BillIQ &gt; Settings &gt; Hardware &amp; Printing.</p>
<form method="POST" action="/pair"><input name="pairingCode" maxlength="6" autofocus placeholder="123456" value="${prefill}"><button type="submit">Pair</button></form>`),
      );
      return;
    }

    if (url.pathname === '/pair' && req.method === 'POST') {
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const pairingCode = params.get('pairingCode') ?? '';
      try {
        const result = await pairDevice(deps.config, pairingCode);
        deps.onPaired?.(result.deviceId);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html(`<h1>Device Trusted ✓</h1><p>Device ID: <code>${result.deviceId}</code></p><p><a href="/">Back</a></p>`));
      } catch (err) {
        // Always log the real cause server-side (spec §24) even though the browser only ever
        // sees the safe, user-facing PairingError message — an unexpected (non-PairingError)
        // failure here would otherwise be silently swallowed into a generic "Pairing failed."
        logger.error('[print-agent] Pairing failed:', err);
        const message = err instanceof PairingError ? err.message : 'Pairing failed.';
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(html(`<h1>Pairing failed</h1><p>${message}</p><p><a href="/pair">Try again</a></p>`));
      }
      return;
    }

    if (url.pathname === '/test-print' && req.method === 'GET') {
      const printers = await deps.registry.discover();
      // Paper size is a free choice, not trusted from discovery: `Get-Printer` (the OS adapter's
      // only source of printer info) has no reliable way to tell a real 58mm/80mm thermal printer
      // apart from a generic A4 one, so discover() always reports OS printers as 'A4' by default.
      // Without this selector there was no way to actually test-print an OS-installed thermal
      // printer (e.g. one set up with Windows' "Generic / Text Only" driver) at its real paper
      // width — it would silently fall into the PDF path instead of the raw ESC/POS path.
      const PAPER_WIDTHS = ['58mm', '80mm', 'A4', 'A5', 'Letter', 'Legal'] as const;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        html(`<h1>Test Print</h1>
<form method="POST" action="/test-print">
<label>Printer<br><select name="printerId">${printers.map((p) => `<option value="${p.printerId}">${p.name} (${p.connectionType})</option>`).join('')}</select></label><br><br>
<label>Paper size<br><select name="paperWidth">${PAPER_WIDTHS.map((w) => `<option value="${w}"${w === '80mm' ? ' selected' : ''}>${w}</option>`).join('')}</select></label><br>
<button type="submit">Print</button></form>`),
      );
      return;
    }

    if (url.pathname === '/test-print' && req.method === 'POST') {
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const printerId = params.get('printerId') ?? '';
      const paperWidth = (params.get('paperWidth') as import('./types.js').PaperWidth) || '80mm';
      try {
        const adapter = await deps.registry.forPrinter(printerId);
        await adapter.print(printerId, { type: 'test_print', paperWidth }, await adapter.getCapabilities(printerId));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html('<h1>Printer connection successful</h1><p><a href="/">Back</a></p>'));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(html(`<h1>Printing failed. Retry?</h1><p>${err instanceof Error ? err.message : ''}</p><p><a href="/test-print">Back</a></p>`));
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });
}
