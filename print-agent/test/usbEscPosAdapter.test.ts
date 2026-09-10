import { describe, expect, it, vi } from 'vitest';

/** Minimal fake of the `usb` package's device shape — just enough of `deviceDescriptor`/
 * `configDescriptor` for `UsbEscPosAdapter.discover()`'s class-matching logic. */
function fakeDevice(opts: { idVendor: number; idProduct: number; bDeviceClass?: number; interfaceClass?: number }) {
  return {
    deviceDescriptor: { idVendor: opts.idVendor, idProduct: opts.idProduct, bDeviceClass: opts.bDeviceClass ?? 0 },
    configDescriptor: { interfaces: [[{ bInterfaceClass: opts.interfaceClass ?? 0 }]] },
  };
}

const mockDevices: ReturnType<typeof fakeDevice>[] = [];

vi.mock('usb', () => ({
  getDeviceList: () => mockDevices,
  findByIds: vi.fn(),
  usb: { LIBUSB_TRANSFER_TYPE_BULK: 3 },
}));

const { UsbEscPosAdapter } = await import('../src/adapters/UsbEscPosAdapter.js');

describe('UsbEscPosAdapter.discover', () => {
  it('reports an unconfigured device that declares the standard USB Printer class (0x07)', async () => {
    mockDevices.length = 0;
    mockDevices.push(fakeDevice({ idVendor: 0x1234, idProduct: 0x5678, bDeviceClass: 0x07 }));
    const found = await new UsbEscPosAdapter().discover();
    expect(found).toHaveLength(1);
  });

  it('ignores an unconfigured device that is not USB Printer class — avoids listing every random USB peripheral', async () => {
    mockDevices.length = 0;
    mockDevices.push(fakeDevice({ idVendor: 0x1234, idProduct: 0x5678, bDeviceClass: 0xff }));
    const found = await new UsbEscPosAdapter().discover();
    expect(found).toHaveLength(0);
  });

  it('reports a manually-configured printer even when it does not declare the USB Printer class — the real-world case (a cheap thermal printer using a vendor-specific/serial-bridge chip instead) that a class-only filter silently dropped before', async () => {
    mockDevices.length = 0;
    mockDevices.push(fakeDevice({ idVendor: 0x0483, idProduct: 0x5743, bDeviceClass: 0xff, interfaceClass: 0xff }));
    const adapter = new UsbEscPosAdapter();
    adapter.configure({ printerId: 'foodchow-1', name: 'FoodChow 2-Inch', vendorId: 0x0483, productId: 0x5743, paperWidth: '58mm' });
    const found = await adapter.discover();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ printerId: 'foodchow-1', name: 'FoodChow 2-Inch', paperWidth: '58mm' });
  });

  it('does not let one configured printer\'s vendor/product ID wrongly match an unrelated connected device', async () => {
    mockDevices.length = 0;
    mockDevices.push(fakeDevice({ idVendor: 0x9999, idProduct: 0x8888, bDeviceClass: 0xff }));
    const adapter = new UsbEscPosAdapter();
    adapter.configure({ printerId: 'foodchow-1', name: 'FoodChow 2-Inch', vendorId: 0x0483, productId: 0x5743, paperWidth: '58mm' });
    const found = await adapter.discover();
    expect(found).toHaveLength(0);
  });
});
