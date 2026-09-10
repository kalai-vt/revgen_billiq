import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Kot, RestaurantOrder } from '@/features/restaurant/api';
import type { PrinterConfiguration } from '@/features/settings/printerApi';

vi.mock('@/features/settings/printerApi', () => ({ getPrinterConfig: vi.fn() }));
vi.mock('@/lib/printing/qzTray', () => ({ printRaw: vi.fn() }));
vi.mock('@/lib/printing/printAgentClient', () => ({ printKot: vi.fn() }));
vi.mock('@/lib/printing/webUsbPrinter', () => ({ printRaw: vi.fn() }));
vi.mock('@/lib/printing/webBluetoothPrinter', () => ({ printRaw: vi.fn() }));

import * as qzTray from '@/lib/printing/qzTray';
import * as webBluetoothPrinter from '@/lib/printing/webBluetoothPrinter';
import { buildKotTicket, buildTestKotTicket, kotPrintFailureMessage, printKotWithConfig, testKotPrint } from './kotPrint';

const kot = {
  id: 'k1',
  kot_number: 'KOT-0007',
  notes: 'rush',
  created_at: '2026-08-08T10:30:00.000Z',
  items: [{ id: 'i1', product_name: 'Masala Dosa', quantity: 2, notes: 'no onion' }],
} as unknown as Kot;

const order = { id: 'o1', order_number: 'ORD-0012', table_name: '4', order_type: 'dine_in' } as unknown as RestaurantOrder;

function config(overrides: Partial<PrinterConfiguration> = {}): PrinterConfiguration {
  return {
    id: 'p1',
    role: 'kot',
    enabled: true,
    printer_name: 'Kitchen',
    connection_type: 'usb',
    ip_address: null,
    port: null,
    usb_device_id: null,
    bluetooth_device_id: null,
    paper_width: '80mm',
    copies: 1,
    auto_print: true,
    ticket_fields: {
      restaurant_name: true,
      table_number: true,
      kot_number: true,
      date_time: true,
      customer_name: false,
      order_notes: true,
    },
    connection_status: 'connected',
    last_tested_at: null,
    last_test_error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('buildKotTicket', () => {
  it('carries what the kitchen needs off the order and KOT', () => {
    expect(buildKotTicket(kot, order, true)).toMatchObject({
      kotNumber: 'KOT-0007',
      orderNumber: 'ORD-0012',
      tableName: '4',
      reprint: true,
      items: [{ name: 'Masala Dosa', quantity: 2, notes: 'no onion' }],
    });
  });

  it('honours the ticket field toggles', () => {
    const fields = { ...config().ticket_fields, table_number: false, order_notes: false };
    const ticket = buildKotTicket(kot, order, false, fields);
    expect(ticket.tableName).toBeNull();
    expect(ticket.notes).toBeNull();
  });
});

describe('printKotWithConfig', () => {
  it('sends ESC/POS to the configured USB printer', async () => {
    await expect(printKotWithConfig(config(), kot, order)).resolves.toEqual({ ok: true });
    expect(vi.mocked(qzTray.printRaw).mock.calls[0][0]).toBe('Kitchen');
  });

  it('prints one ticket per configured copy', async () => {
    await printKotWithConfig(config({ copies: 3 }), kot, order);
    expect(qzTray.printRaw).toHaveBeenCalledTimes(3);
  });

  it('routes Bluetooth to the Bluetooth transport', async () => {
    await printKotWithConfig(config({ connection_type: 'bluetooth' }), kot, order);
    expect(webBluetoothPrinter.printRaw).toHaveBeenCalled();
    expect(qzTray.printRaw).not.toHaveBeenCalled();
  });

  it('refuses a network printer rather than failing somewhere obscure', async () => {
    const result = await printKotWithConfig(
      config({ connection_type: 'lan', ip_address: '192.168.1.9', port: 9100 }),
      kot,
      order,
    );
    expect(result).toEqual({ ok: false, reason: 'unsupported-transport' });
    expect(qzTray.printRaw).not.toHaveBeenCalled();
  });

  it('does nothing when KOT printing is switched off', async () => {
    expect(await printKotWithConfig(config({ enabled: false }), kot, order)).toEqual({ ok: false, reason: 'disabled' });
  });

  it('reports a transport failure with its reason instead of claiming success', async () => {
    vi.mocked(qzTray.printRaw).mockRejectedValue(new Error('Printer is offline'));
    const result = await printKotWithConfig(config(), kot, order);
    expect(result).toEqual({ ok: false, reason: 'transport-failed', detail: 'Printer is offline' });
    expect(kotPrintFailureMessage(result as Extract<typeof result, { ok: false }>)).toContain('Printer is offline');
  });

  it('every failure tells staff to walk the ticket over', () => {
    for (const reason of ['not-configured', 'disabled', 'unsupported-transport', 'no-printer', 'transport-failed'] as const) {
      expect(kotPrintFailureMessage({ ok: false, reason })).toMatch(/kitchen/i);
    }
  });
});

describe('testKotPrint', () => {
  it('sends a ticket shaped like a real KOT, not a line of test text', async () => {
    await testKotPrint(config());
    const commands = vi.mocked(qzTray.printRaw).mock.calls[0][1].join('');
    expect(commands).toContain('TEST-001');
    expect(commands).toContain('Chicken Biryani');
    expect(commands).toContain('TEST PRINT');
  });

  it('the sample carries the quantities a cook would read', () => {
    expect(buildTestKotTicket().items).toEqual([
      { name: 'Chicken Biryani', quantity: 2 },
      { name: 'Paneer Tikka', quantity: 1 },
      { name: 'Coke', quantity: 2 },
    ]);
  });
});
