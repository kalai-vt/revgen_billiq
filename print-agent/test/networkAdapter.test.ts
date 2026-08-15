import { createServer, type Server } from 'node:net';
import { describe, expect, it, afterEach } from 'vitest';
import { NetworkAdapter } from '../src/adapters/NetworkAdapter.js';
import { toBytes, buildReceiptCommands, type ReceiptBusinessInfo, type ReceiptData } from '../src/renderer/escpos.js';

/** Spins up a real TCP listener on an ephemeral port and captures whatever bytes it receives —
 * this is what makes NetworkAdapter fully testable without real thermal-printer hardware: from
 * the adapter's point of view, a mock JetDirect-style listener is indistinguishable from a real
 * network printer, since the ESC/POS bytes are opaque to the transport either way. */
function mockPrinter(): Promise<{ server: Server; port: number; received: () => Buffer }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const server = createServer((socket) => {
      socket.on('data', (chunk) => chunks.push(chunk));
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, port, received: () => Buffer.concat(chunks) });
    });
  });
}

describe('NetworkAdapter', () => {
  let server: Server | null = null;

  afterEach(() => {
    server?.close();
    server = null;
  });

  it('writes the exact ESC/POS bytes buildReceiptCommands produces', async () => {
    const mock = await mockPrinter();
    server = mock.server;

    const adapter = new NetworkAdapter();
    adapter.configure({ printerId: 'kitchen-1', name: 'Kitchen', host: '127.0.0.1', port: mock.port, paperWidth: '80mm' });

    const business: ReceiptBusinessInfo = { companyName: 'Acme Retail' };
    const data: ReceiptData = {
      invoiceNumber: 'INV-1',
      createdAt: '2026-08-08T10:30:00.000Z',
      cashierName: 'Ada',
      items: [{ name: 'Widget', quantity: 1, unitPrice: 100, lineTotal: 100 }],
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 0,
      taxPercentage: 0,
      totalAmount: 100,
      paymentMethod: 'cash',
      currency: 'INR',
      decimalPrecision: 2,
    };

    await adapter.print('kitchen-1', { type: 'tax_invoice', paperWidth: '80mm', receipt: { business, data } }, await adapter.getCapabilities('kitchen-1'));

    // Give the mock server's 'data' event a tick to fire after the socket write resolves.
    await new Promise((r) => setTimeout(r, 50));

    const expected = Buffer.from(toBytes(buildReceiptCommands(business, data, '80mm')));
    expect(mock.received().equals(expected)).toBe(true);
  });

  it('discover() reports every configured printer', async () => {
    const adapter = new NetworkAdapter();
    adapter.configure({ printerId: 'p1', name: 'Printer One', host: '127.0.0.1', port: 9100, paperWidth: '58mm' });
    const printers = await adapter.discover();
    expect(printers).toHaveLength(1);
    expect(printers[0]).toMatchObject({ printerId: 'p1', paperWidth: '58mm', connectionType: 'network' });
  });

  it('rejects a print to an unconfigured printerId', async () => {
    const adapter = new NetworkAdapter();
    await expect(
      adapter.print('unknown', { type: 'test_print', paperWidth: '80mm' }, await adapter.getCapabilities('unknown')),
    ).rejects.toThrow(/Unknown network printer/);
  });
});
