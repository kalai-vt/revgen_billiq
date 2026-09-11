import { describe, expect, it } from 'vitest';
import { buildKotCommands, type KotTicketData } from '@/lib/printing/escpos';

const base: KotTicketData = {
  kotNumber: 'KOT-000048',
  orderNumber: 'ORD-000012',
  tableName: '12',
  orderType: 'dine_in',
  createdAt: '2026-09-10T10:30:00.000Z',
  items: [
    { name: 'Chicken Biryani', quantity: 2 },
    { name: 'Butter Naan', quantity: 1, notes: 'no butter' },
  ],
};

function text(commands: string[]): string {
  return commands.join('');
}

describe('buildKotCommands — the kitchen ticket', () => {
  it('leads with the KOT number and where the food is going', () => {
    const out = text(buildKotCommands(base, '80mm'));
    expect(out).toContain('KOT-000048');
    expect(out).toContain('TABLE 12');
    expect(out).toContain('ORD-000012');
  });

  it('does not say TABLE twice when the table is already named "Table 4"', () => {
    // Restaurants name tables both ways, and a cook reading TABLE TABLE 4 across the pass has to
    // stop and parse it.
    const out = text(buildKotCommands({ ...base, tableName: 'Table 4' }, '80mm'));
    expect(out).toContain('TABLE 4');
    expect(out).not.toContain('TABLE TABLE');
  });

  it('never prints money on a kitchen ticket', () => {
    // A KOT is a work order for the pass. Prices on it invite it being handed over as a bill.
    const out = text(buildKotCommands(base, '80mm'));
    expect(out).not.toMatch(/Rs\.|TOTAL|Subtotal|Tax/i);
  });

  it('prints every item with its quantity and any kitchen note', () => {
    const out = text(buildKotCommands(base, '80mm'));
    expect(out).toContain('2 x');
    expect(out).toContain('Chicken Biryani');
    expect(out).toContain('1 x');
    expect(out).toContain('Butter Naan');
    expect(out).toContain('no butter');
  });

  it('marks a takeaway rather than showing a table that does not exist', () => {
    const out = text(buildKotCommands({ ...base, orderType: 'takeaway', tableName: null }, '80mm'));
    expect(out).toContain('TAKEAWAY');
    expect(out).not.toContain('TABLE');
  });

  it('makes a reprint obvious so the kitchen does not cook it twice', () => {
    expect(text(buildKotCommands({ ...base, reprint: true }, '80mm'))).toContain('*** REPRINT ***');
    expect(text(buildKotCommands(base, '80mm'))).not.toContain('REPRINT');
  });

  it('wraps a long dish name to the narrower 58mm ticket instead of truncating it', () => {
    const longName = 'Paneer Butter Masala with Extra Cheese and Garlic Naan';
    const out = text(buildKotCommands({ ...base, items: [{ name: longName, quantity: 1 }] }, '58mm'));
    // A cook needs the whole dish name, so every word has to survive the wrap — truncating the
    // line would silently drop what the dish actually is.
    for (const word of longName.split(' ')) {
      expect(out).toContain(word);
    }
    // And it must genuinely wrap rather than run past the 32-column ticket.
    expect(out).not.toContain(longName);
  });

  it('ends with a cut so the ticket separates itself at the pass', () => {
    const commands = buildKotCommands(base, '80mm');
    expect(commands[commands.length - 1]).toBe('\x1DV\x01');
  });
});
