/** Entry point — wires config, the printer adapters, the job queue, the WS API, the local admin
 * HTTP pairing/test-print page, and (best-effort) the tray icon into one running process. Run
 * directly with `npm run dev` for local development, or via `npm run build && node dist/index.js`
 * otherwise — the installed release (see `release/`) launches this exact same file through a
 * bundled portable Node runtime, so behavior is identical whether run from source or installed. */

import { loadConfig, saveConfig, jobQueuePath } from './config.js';
import { PrintJobQueue } from './queue.js';
import { PrinterRegistry } from './registry.js';
import { NetworkAdapter } from './adapters/NetworkAdapter.js';
import { OsPrinterAdapter } from './adapters/OsPrinterAdapter.js';
import { UsbEscPosAdapter } from './adapters/UsbEscPosAdapter.js';
import { BluetoothSerialAdapter } from './adapters/BluetoothSerialAdapter.js';
import { createServer } from './server.js';
import { createAdminHttpServer } from './adminHttp.js';
import { startTray } from './tray.js';
import { ensureTokenPublicKey } from './pairing.js';
import { logger } from './log.js';

const ADMIN_PORT_OFFSET = 1;

async function main(): Promise<void> {
  const config = await loadConfig();

  if (config.deviceId) {
    // Best-effort: if the backend is unreachable at startup, printing can still work offline
    // (spec §13) as long as the public key was already cached from a previous run — only a
    // brand-new pairing with no prior successful fetch requires the backend to be reachable.
    try {
      await ensureTokenPublicKey(config);
    } catch (err) {
      logger.warn('[print-agent] Could not refresh the token verification key at startup:', err instanceof Error ? err.message : err);
    }
  }

  const networkAdapter = new NetworkAdapter();
  const osAdapter = new OsPrinterAdapter();
  const usbAdapter = new UsbEscPosAdapter();
  const bluetoothAdapter = new BluetoothSerialAdapter();
  const registry = new PrinterRegistry([osAdapter, networkAdapter, usbAdapter, bluetoothAdapter]);

  // Lives next to config.json/device.secret in the stable per-user config directory, not
  // process.cwd() — a Start Menu/Startup shortcut's working directory isn't guaranteed, so a
  // cwd-relative path here would silently create a fresh, empty queue file every time the launch
  // method changed, quietly losing whatever was in the old one.
  const queue = new PrintJobQueue(jobQueuePath());

  const wss = createServer({ config, registry, queue });
  logger.info(`[print-agent] WebSocket API listening on ws://127.0.0.1:${config.port}`);

  const adminPort = config.port + ADMIN_PORT_OFFSET;
  const adminServer = createAdminHttpServer({
    config,
    registry,
    onPaired: (deviceId) => logger.info(`[print-agent] Paired as device ${deviceId}`),
  });
  adminServer.listen(adminPort, '127.0.0.1', () => {
    logger.info(`[print-agent] Admin page at http://127.0.0.1:${adminPort}/`);
  });

  const shutdown = () => {
    logger.info('[print-agent] Shutting down...');
    wss.close();
    adminServer.close();
    queue.close();
    process.exit(0);
  };

  await startTray({ adminUrl: `http://127.0.0.1:${adminPort}/`, onQuit: shutdown });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await saveConfig(config);
}

main().catch((err) => {
  logger.error('[print-agent] Fatal startup error:', err);
  process.exit(1);
});
