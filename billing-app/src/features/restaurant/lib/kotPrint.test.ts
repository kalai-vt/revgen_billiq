import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Kot, RestaurantOrder } from '@/features/restaurant/api';

vi.mock('@/features/settings/api', () => ({ getBusinessPreferences: vi.fn() }));
vi.mock('@/lib/printing/qzTray', () => ({ printRaw: vi.fn() }));
vi.mock('@/lib/printing/printAgentClient', () => ({ printKot: vi.fn() }));
vi.mock('@/lib/printing/webUsbPrinter', () => ({ printRaw: vi.fn() }));
vi.mock('@/lib/printing/webBluetoothPrinter', () => ({ printRaw: vi.fn() }));

import * as settingsApi from '@/features/settings/api';
import * as qzTray from '@/lib/printing/qzTray';
import * as printAgentClient from '@/lib/printing/printAgentClient';
import * as webUsbPrinter from '@/lib/printing/webUsbPrinter';
import { buildKotTicket, kotPrintFailureMessage, printKot } from './kotPrint';

const kot = {
  id: 'k1',
  kot_number: 'KOT-0007',
  status: 'pending',
  print_count: 0,
  cancel_reason: null,
  notes: 'rush',
  created_at: '2026-08-08T10:30:00.000Z',
  items: [{ id: 'i1', product_name: 'Masala Dosa', quantity: 2, notes: 'no onion' }],
} as unknown as Kot;

const order = {
  id: 'o1',
  order_number: 'ORD-0012',
  table_name: '4',
  order_type: 'dine_in',
} as unknown as RestaurantOrder;

function preferences(overrides: Record<string, unknown> = {}) {
  return {
    auto_print_device_mode: 'qz',
    auto_print_printer_name: 'Front Till',
    kot_printer_name: 'Kitchen',
    kot_paper_size: '80mm',
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof settingsApi.getBusinessPreferences>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('buildKotTicket', () => {
  it('carries only what the kitchen needs off the order and KOT', () => {
    const ticket = buildKotTicket(kot, order, true);
    expect(ticket).toMatchObject({
      kotNumber: 'KOT-0007',
      orderNumber: 'ORD-0012',
      tableName: '4',
      orderType: 'dine_in',
      reprint: true,
      notes: 'rush',
      items: [{ name: 'Masala Dosa', quantity: 2, notes: 'no onion' }],
    });
  });
});

describe('printKot — printer selection', () => {
  it('prefers the kitchen printer over the billing printer', async () => {
    vi.mocked(settingsApi.getBusinessPreferences).mockResolvedValue(preferences());
    await expect(printKot(kot, order)).resolves.toEqual({ ok: true });
    expect(vi.mocked(qzTray.printRaw).mock.calls[0][0]).toBe('Kitchen');
  });

  it('falls back to the billing printer when no kitchen printer is set — the single-printer shop', async () => {
    vi.mocked(settingsApi.getBusinessPreferences).mockResolvedValue(preferences({ kot_printer_name: null }));
    await expect(printKot(kot, order)).resolves.toEqual({ ok: true });
    expect(vi.mocked(qzTray.printRaw).mock.calls[0][0]).toBe('Front Till');
  });
});

describe('printKot — transports', () => {
  it('sends the agent a structured kot document, not raw bytes', async () => {
    vi.mocked(settingsApi.getBusinessPreferences).mockResolvedValue(preferences({ auto_print_device_mode: 'revgenai-agent' }));
    await expect(printKot(kot, order, true)).resolves.toEqual({ ok: true });
    expect(printAgentClient.printKot).toHaveBeenCalledWith('Kitchen', expect.objectContaining({ kotNumber: 'KOT-0007', reprint: true }), '80mm');
  });

  it('sends ESC/POS bytes over WebUSB, which has no renderer of its own', async () => {
    vi.mocked(settingsApi.getBusinessPreferences).mockResolvedValue(preferences({ auto_print_device_mode: 'web-usb' }));
    await expect(printKot(kot, order)).resolves.toEqual({ ok: true });
    const commands = vi.mocked(webUsbPrinter.printRaw).mock.calls[0][0];
    expect(commands.join('')).toContain('KOT-0007');
    expect(commands.join('')).toContain('TABLE 4');
  });
});

describe('printKot — failures are never silent', () => {
  it('reports a transport failure with its reason rather than claiming success', async () => {
    vi.mocked(settingsApi.getBusinessPreferences).mockResolvedValue(preferences());
    vi.mocked(qzTray.printRaw).mockRejectedValue(new Error('Printer offline'));
    const result = await printKot(kot, order);
    expect(result).toEqual({ ok: false, reason: 'transport-failed', detail: 'Printer offline' });
    expect(kotPrintFailureMessage(result as Extract<typeof result, { ok: false }>)).toContain('Printer offline');
  });

  it('reports no printer selected when the mode needs one and none is set', async () => {
    vi.mocked(settingsApi.getBusinessPreferences).mockResolvedValue(
      preferences({ kot_printer_name: null, auto_print_printer_name: null }),
    );
    expect(await printKot(kot, order)).toEqual({ ok: false, reason: 'no-printer' });
    expect(qzTray.printRaw).not.toHaveBeenCalled();
  });

  it('reports not-configured when no silent transport is set up at all', async () => {
    vi.mocked(settingsApi.getBusinessPreferences).mockResolvedValue(preferences({ auto_print_device_mode: null }));
    expect(await printKot(kot, order)).toEqual({ ok: false, reason: 'not-configured' });
  });

  it('every failure reason tells staff to hand the ticket over', () => {
    for (const reason of ['not-configured', 'browser-dialog', 'no-printer', 'transport-failed'] as const) {
      expect(kotPrintFailureMessage({ ok: false, reason })).toMatch(/kitchen/i);
    }
  });
});
