import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockWebsocket, mockPrinters, mockConfigsCreate, mockPrint, mockSecurity, mockCheckLna } = vi.hoisted(() => ({
  mockWebsocket: {
    isActive: vi.fn(() => false),
    connect: vi.fn(() => Promise.resolve()),
  },
  mockPrinters: { find: vi.fn((): Promise<string | string[]> => Promise.resolve(['POS58'])) },
  mockConfigsCreate: vi.fn((name: string) => ({ printerName: name })),
  mockPrint: vi.fn(() => Promise.resolve()),
  mockSecurity: {
    setSignatureAlgorithm: vi.fn(),
    setCertificatePromise: vi.fn(),
    setSignaturePromise: vi.fn(),
  },
  mockCheckLna: vi.fn(),
}));

vi.mock('qz-tray', () => ({
  default: {
    websocket: mockWebsocket,
    printers: mockPrinters,
    configs: { create: mockConfigsCreate },
    print: mockPrint,
    security: mockSecurity,
  },
}));

vi.mock('@/lib/printing/qzTraySigning', () => ({
  getCertificate: vi.fn(() => Promise.resolve('')),
  sign: vi.fn(() => Promise.resolve('')),
}));

vi.mock('@/lib/printing/lna', () => ({
  checkLocalNetworkAccess: () => mockCheckLna(),
}));

import * as qzTray from '@/lib/printing/qzTray';

beforeEach(() => {
  vi.clearAllMocks();
  mockWebsocket.isActive.mockReturnValue(false);
  mockWebsocket.connect.mockResolvedValue(undefined);
  mockCheckLna.mockResolvedValue('granted');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('connect', () => {
  it('reuses an in-flight connection instead of opening a second websocket', async () => {
    let resolveConnect: () => void;
    mockWebsocket.connect.mockReturnValue(new Promise<void>((resolve) => { resolveConnect = resolve; }));

    const first = qzTray.connect();
    const second = qzTray.connect();
    resolveConnect!();
    await Promise.all([first, second]);

    expect(mockWebsocket.connect).toHaveBeenCalledTimes(1);
  });

  it('does nothing when a connection is already active', async () => {
    mockWebsocket.isActive.mockReturnValue(true);
    await qzTray.connect();
    expect(mockWebsocket.connect).not.toHaveBeenCalled();
  });

  it('throws a QzTrayError with a clear message on failure', async () => {
    mockWebsocket.connect.mockRejectedValue(new Error('boom'));
    await expect(qzTray.connect()).rejects.toThrow('boom');
  });
});

describe('connectWithDiagnostics', () => {
  it("returns 'connected' immediately without an LNA check when already active", async () => {
    mockWebsocket.isActive.mockReturnValue(true);
    const state = await qzTray.connectWithDiagnostics();
    expect(state).toBe('connected');
    expect(mockCheckLna).not.toHaveBeenCalled();
  });

  it("returns 'lna-denied' and never attempts a websocket connection when LNA is denied", async () => {
    mockCheckLna.mockResolvedValue('denied');
    const state = await qzTray.connectWithDiagnostics();
    expect(state).toBe('lna-denied');
    expect(mockWebsocket.connect).not.toHaveBeenCalled();
  });

  it("returns 'lna-prompt' and never attempts a websocket connection when LNA is pending", async () => {
    mockCheckLna.mockResolvedValue('prompt');
    const state = await qzTray.connectWithDiagnostics();
    expect(state).toBe('lna-prompt');
    expect(mockWebsocket.connect).not.toHaveBeenCalled();
  });

  it("returns 'connected' when LNA is granted and the websocket connects", async () => {
    mockCheckLna.mockResolvedValue('granted');
    const state = await qzTray.connectWithDiagnostics();
    expect(state).toBe('connected');
  });

  it("returns 'connected' when LNA is unsupported (older browser) and the websocket connects", async () => {
    mockCheckLna.mockResolvedValue('unsupported');
    const state = await qzTray.connectWithDiagnostics();
    expect(state).toBe('connected');
  });

  it("returns 'unavailable' when LNA allows the attempt but QZ Tray itself isn't reachable", async () => {
    mockCheckLna.mockResolvedValue('granted');
    mockWebsocket.connect.mockRejectedValue(new Error('Could not connect'));
    const state = await qzTray.connectWithDiagnostics();
    expect(state).toBe('unavailable');
  });
});

describe('listPrinters', () => {
  it('normalizes a single printer name into an array', async () => {
    mockPrinters.find.mockResolvedValue('POS58');
    expect(await qzTray.listPrinters()).toEqual(['POS58']);
  });

  it('passes an array of printer names through unchanged', async () => {
    mockPrinters.find.mockResolvedValue(['POS58', 'EPSON80']);
    expect(await qzTray.listPrinters()).toEqual(['POS58', 'EPSON80']);
  });
});

describe('printRaw / printPdf', () => {
  it('printRaw throws without attempting to connect when no printer name is given', async () => {
    await expect(qzTray.printRaw('', ['data'])).rejects.toThrow(/no printer/i);
    expect(mockWebsocket.connect).not.toHaveBeenCalled();
  });

  it('printPdf throws without attempting to connect when no printer name is given', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await expect(qzTray.printPdf('', blob)).rejects.toThrow(/no printer/i);
    expect(mockWebsocket.connect).not.toHaveBeenCalled();
  });

  it('printRaw sends the given commands to the configured printer', async () => {
    await qzTray.printRaw('POS58', ['ESC', '@']);
    expect(mockConfigsCreate).toHaveBeenCalledWith('POS58');
    expect(mockPrint).toHaveBeenCalledWith({ printerName: 'POS58' }, ['ESC', '@']);
  });
});
