import { describe, expect, it } from 'vitest';
import { buildLineOption } from './buildLineOption';
import { buildAreaOption } from './buildAreaOption';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOption = any;

describe('buildLineOption', () => {
  it('builds one line series per input series, smooth by default', () => {
    const option: AnyOption = buildLineOption({
      categories: ['Jan', 'Feb', 'Mar'],
      series: [
        { name: 'Swiggy', values: [10, 20, 30] },
        { name: 'Zomato', values: [5, 15, 25] },
      ],
      themeName: 'billiq-light',
    });
    expect(option.series).toHaveLength(2);
    expect(option.series.every((s: AnyOption) => s.type === 'line' && s.smooth === true)).toBe(true);
    expect(option.legend.data).toEqual(['Swiggy', 'Zomato']);
  });

  it('leaves areaStyle unset unless a series opts in', () => {
    const option: AnyOption = buildLineOption({
      categories: ['Jan'],
      series: [{ name: 'Revenue', values: [100] }],
      themeName: 'billiq-light',
    });
    expect(option.series[0].areaStyle).toBeUndefined();
  });

  it('attaches an average markLine when requested', () => {
    const option: AnyOption = buildLineOption({
      categories: ['Jan'],
      series: [{ name: 'Revenue', values: [100], showAverage: true }],
      themeName: 'billiq-light',
    });
    expect(option.series[0].markLine.data[0].type).toBe('average');
  });
});

describe('buildAreaOption', () => {
  it('turns on gradient areaStyle for every series by default', () => {
    const option: AnyOption = buildAreaOption({
      categories: ['Jan', 'Feb'],
      series: [{ name: 'Revenue', values: [100, 200] }],
      themeName: 'billiq-light',
    });
    expect(option.series[0].areaStyle).toBeDefined();
  });

  it('lets a series opt out of the area fill explicitly', () => {
    const option: AnyOption = buildAreaOption({
      categories: ['Jan'],
      series: [{ name: 'Revenue', values: [100], area: false }],
      themeName: 'billiq-light',
    });
    expect(option.series[0].areaStyle).toBeUndefined();
  });
});
