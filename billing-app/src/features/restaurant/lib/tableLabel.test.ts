import { describe, expect, it } from 'vitest';
import { orderLocationLabel, tableLabel } from '@/features/restaurant/lib/tableLabel';

describe('tableLabel', () => {
  it('adds the prefix for a bare number, the common naming', () => {
    expect(tableLabel('5')).toBe('Table 5');
  });

  it('does not double the prefix when the restaurant already typed it', () => {
    // "Table Table 2" is what this exists to prevent.
    expect(tableLabel('Table 2')).toBe('Table 2');
    expect(tableLabel('table 2')).toBe('table 2');
    expect(tableLabel('TABLE 2')).toBe('TABLE 2');
  });

  it('only matches the whole word, so a name like Tabletop still gets a prefix', () => {
    expect(tableLabel('Tabletop 1')).toBe('Table Tabletop 1');
  });

  it('handles blank names without emitting "Table undefined"', () => {
    expect(tableLabel('')).toBe('Table');
    expect(tableLabel(null)).toBe('Table');
  });
});

describe('orderLocationLabel', () => {
  it('falls back to takeaway when there is no table', () => {
    expect(orderLocationLabel(null)).toBe('Takeaway');
    expect(orderLocationLabel(null, 'takeaway order')).toBe('takeaway order');
  });

  it('names the table otherwise, without doubling', () => {
    expect(orderLocationLabel('Table 7')).toBe('Table 7');
    expect(orderLocationLabel('7')).toBe('Table 7');
  });
});
