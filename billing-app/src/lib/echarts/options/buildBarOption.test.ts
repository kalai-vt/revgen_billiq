import { describe, expect, it } from 'vitest';
import { buildBarOption } from './buildBarOption';
import { DATA_ZOOM_POINT_THRESHOLD } from '../dataZoom';

// Option builders return the loosely-typed `EChartsOption`; tests read fields
// back off the plain object they know these builders produce.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOption = any;

describe('buildBarOption', () => {
  it('builds a single bar series with category axis data matching input', () => {
    const option: AnyOption = buildBarOption({
      categories: ['Beverages', 'Snacks', 'Dairy'],
      series: [{ name: 'Revenue', values: [100, 200, 300] }],
      themeName: 'billiq-light',
      valueFormat: 'currency',
    });

    expect(option.series).toHaveLength(1);
    expect(option.series[0].type).toBe('bar');
    expect(option.series[0].data).toEqual([100, 200, 300]);
    expect(option.xAxis.data).toEqual(['Beverages', 'Snacks', 'Dairy']);
    expect(option.legend).toBeUndefined(); // single series never needs a legend
  });

  it('shows a legend once there is more than one series', () => {
    const option: AnyOption = buildBarOption({
      categories: ['Jan', 'Feb'],
      series: [
        { name: 'A', values: [1, 2] },
        { name: 'B', values: [3, 4] },
      ],
      themeName: 'billiq-light',
    });
    expect(option.legend.data).toEqual(['A', 'B']);
  });

  it('swaps axes for the horizontal variant', () => {
    const option: AnyOption = buildBarOption({
      categories: ['A', 'B'],
      series: [{ name: 'Revenue', values: [1, 2] }],
      themeName: 'billiq-light',
      variant: 'horizontal',
    });
    expect(option.xAxis.type).toBe('value');
    expect(option.yAxis.type).toBe('category');
  });

  it('formats the tooltip value as full Indian currency for a currency series', () => {
    const option: AnyOption = buildBarOption({
      categories: ['A'],
      series: [{ name: 'Revenue', values: [235400] }],
      themeName: 'billiq-light',
      valueFormat: 'currency',
    });
    expect(option.tooltip.valueFormatter(235400)).toBe('₹2,35,400.00');
  });

  it('only attaches dataZoom for time-series data past the point threshold', () => {
    const small: AnyOption = buildBarOption({
      categories: Array.from({ length: 5 }, (_, i) => `H${i}`),
      series: [{ name: 'Revenue', values: [1, 2, 3, 4, 5] }],
      themeName: 'billiq-light',
      dataZoomKind: 'time-series',
    });
    expect(small.dataZoom).toBeUndefined();

    const dense: AnyOption = buildBarOption({
      categories: Array.from({ length: DATA_ZOOM_POINT_THRESHOLD + 1 }, (_, i) => `H${i}`),
      series: [{ name: 'Revenue', values: Array.from({ length: DATA_ZOOM_POINT_THRESHOLD + 1 }, () => 1) }],
      themeName: 'billiq-light',
      dataZoomKind: 'time-series',
    });
    expect(dense.dataZoom).toBeDefined();
  });

  it('never attaches dataZoom for categorical data regardless of point count', () => {
    const option: AnyOption = buildBarOption({
      categories: Array.from({ length: 50 }, (_, i) => `Cat ${i}`),
      series: [{ name: 'Revenue', values: Array.from({ length: 50 }, () => 1) }],
      themeName: 'billiq-light',
      dataZoomKind: 'categorical',
    });
    expect(option.dataZoom).toBeUndefined();
  });
});
