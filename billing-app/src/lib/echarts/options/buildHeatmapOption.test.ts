import { describe, expect, it } from 'vitest';
import { buildHeatmapOption } from './buildHeatmapOption';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOption = any;

describe('buildHeatmapOption', () => {
  it('maps each cell to [xIndex, yIndex, value] against its category axes', () => {
    const option: AnyOption = buildHeatmapOption({
      xCategories: ['Mon', 'Tue'],
      yCategories: ['08:00', '09:00'],
      cells: [
        { x: 'Tue', y: '09:00', value: 42 },
        { x: 'Mon', y: '08:00', value: 7 },
      ],
      themeName: 'billiq-light',
    });
    expect(option.series[0].data).toEqual([
      [1, 1, 42],
      [0, 0, 7],
    ]);
  });

  it('sizes the visualMap range to the largest cell value', () => {
    const option: AnyOption = buildHeatmapOption({
      xCategories: ['Mon'],
      yCategories: ['08:00'],
      cells: [{ x: 'Mon', y: '08:00', value: 99 }],
      themeName: 'billiq-light',
    });
    expect(option.visualMap.max).toBe(99);
  });
});
