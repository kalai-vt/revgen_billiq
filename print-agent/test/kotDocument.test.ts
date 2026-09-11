import { createServer, type Server } from 'node:net';
import { describe, expect, it, afterEach } from 'vitest';
import { NetworkAdapter } from '../src/adapters/NetworkAdapter.js';
import { buildDocumentCommands, UnsupportedDocumentError } from '../src/renderer/document.js';
import { buildKotCommands, toBytes, type KotTicketData } from '../src/renderer/escpos.js';

function ticket(overrides: Partial<KotTicketData> = {}): KotTicketData {
  return {
    kotNumber: 'KOT-0007',
    orderNumber: 'ORD-0012',
    tableName: '4',
    orderType: 'dine_in',
    createdAt: '2026-08-08T10:30:00.000Z',
    items: [{ name: 'Masala Dosa', quantity: 2 }],
    ...overrides,
  };
}

describe('buildKotCommands', () => {
  it('prints what the kitchen needs and none of what it does not', () => {
    const joined = buildKotCommands(ticket({ items: [{ name: 'Masala Dosa', quantity: 2, notes: 'no onion' }] }), '80mm').join('');
    expect(joined).toContain('KOT-0007');
    expect(joined).toContain('ORD-0012');
    expect(joined).toContain('TABLE 4');
    expect(joined).toContain('2 x');
    expect(joined).toContain('Masala Dosa');
    expect(joined).toContain('no onion');
    // A KOT is a cooking instruction, not a bill — a price on it invites the kitchen to hand it
    // to the customer as one.
    expect(joined).not.toContain('TOTAL');
    expect(joined).not.toContain('Rs.');
  });

  it('does not say TABLE twice when the table is already named "Table 4"', () => {
    // Restaurants name tables both ways, and a cook reading TABLE TABLE 4 across the pass has to
    // stop and parse it.
    const joined = buildKotCommands(ticket({ tableName: 'Table 4' }), '80mm').join('');
    expect(joined).toContain('TABLE 4');
    expect(joined).not.toContain('TABLE TABLE');
  });

  it('marks takeaway rather than inventing a table number', () => {
    const joined = buildKotCommands(ticket({ orderType: 'takeaway', tableName: null }), '80mm').join('');
    expect(joined).toContain('TAKEAWAY');
    expect(joined).not.toContain('TABLE');
  });

  it('makes a reprint obvious so the same food is not cooked twice', () => {
    expect(buildKotCommands(ticket({ reprint: true }), '80mm').join('')).toContain('*** REPRINT ***');
    expect(buildKotCommands(ticket(), '80mm').join('')).not.toContain('REPRINT');
  });

  it('wraps dish names to the paper width instead of truncating them', () => {
    const commands = buildKotCommands(ticket({ items: [{ name: 'Paneer Butter Masala with Extra Gravy and Butter Naan', quantity: 1 }] }), '58mm');
    const textLines = commands
      .filter((c) => c.endsWith('\n') && !c.startsWith('\x1B') && !c.startsWith('\x1D'))
      .flatMap((c) => c.split('\n').filter(Boolean));
    for (const line of textLines) expect(line.length).toBeLessThanOrEqual(32);
    // Wrapped, not cut off — the last word still has to survive.
    expect(commands.join(' ')).toContain('Naan');
  });
});

describe('buildDocumentCommands', () => {
  it('routes a kot document to the kitchen-ticket renderer', () => {
    const commands = buildDocumentCommands({ type: 'kot', paperWidth: '80mm', kot: ticket() }, '80mm');
    expect(commands).toEqual(buildKotCommands(ticket(), '80mm'));
  });

  it('refuses a kot document with no payload rather than printing a blank ticket', () => {
    expect(() => buildDocumentCommands({ type: 'kot', paperWidth: '80mm' }, '80mm')).toThrow(UnsupportedDocumentError);
  });
});

/** Spins up a real TCP listener the way networkAdapter.test.ts does — proves the KOT reaches the
 * wire through a real adapter, not just that the renderer returns strings. */
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

describe('adapters accept the kot document type', () => {
  let server: Server | null = null;

  afterEach(() => {
    server?.close();
    server = null;
  });

  it('writes the exact KOT bytes to a network printer', async () => {
    const mock = await mockPrinter();
    server = mock.server;

    const adapter = new NetworkAdapter();
    adapter.configure({ printerId: 'kitchen-1', name: 'Kitchen', host: '127.0.0.1', port: mock.port, paperWidth: '80mm' });
    await adapter.print('kitchen-1', { type: 'kot', paperWidth: '80mm', kot: ticket() }, await adapter.getCapabilities());

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mock.received().equals(Buffer.from(toBytes(buildKotCommands(ticket(), '80mm'))))).toBe(true);
  });
});
