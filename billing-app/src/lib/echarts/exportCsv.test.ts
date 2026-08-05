import { describe, expect, it } from 'vitest';
import { toCsv } from './exportCsv';

interface Row {
  name: string;
  revenue: number;
}

describe('toCsv', () => {
  it('renders a header row from column labels and one row per data item', () => {
    const rows: Row[] = [
      { name: 'Beverages', revenue: 1000 },
      { name: 'Snacks', revenue: 2000 },
    ];
    const csv = toCsv(rows, [
      { key: 'name', label: 'Category' },
      { key: 'revenue', label: 'Revenue' },
    ]);
    expect(csv).toBe('Category,Revenue\nBeverages,1000\nSnacks,2000');
  });

  it('quotes and escapes values containing commas, quotes, or newlines', () => {
    const rows = [{ name: 'Rice, 5kg "Premium"', revenue: 100 }];
    const csv = toCsv(rows, [
      { key: 'name', label: 'Product' },
      { key: 'revenue', label: 'Revenue' },
    ]);
    expect(csv).toBe('Product,Revenue\n"Rice, 5kg ""Premium""",100');
  });

  it('renders null/undefined cell values as an empty string', () => {
    const rows = [{ name: 'Widget', revenue: undefined as unknown as number }];
    const csv = toCsv(rows, [
      { key: 'name', label: 'Product' },
      { key: 'revenue', label: 'Revenue' },
    ]);
    expect(csv).toBe('Product,Revenue\nWidget,');
  });
});
