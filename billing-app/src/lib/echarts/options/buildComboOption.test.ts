import { describe, expect, it } from 'vitest';
import { buildComboOption } from './buildComboOption';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOption = any;

describe('buildComboOption', () => {
  const option: AnyOption = buildComboOption({
    categories: ['Jan', 'Feb'],
    themeName: 'billiq-light',
    bar: { name: 'Revenue', values: [235400, 300000], valueFormat: 'currency' },
    line: { name: 'Orders', values: [12, 18], valueFormat: 'number', allowDecimals: false },
  });

  it('puts the bar series on the left axis and the line series on the right axis', () => {
    expect(option.series[0].type).toBe('bar');
    expect(option.series[0].yAxisIndex).toBe(0);
    expect(option.series[1].type).toBe('line');
    expect(option.series[1].yAxisIndex).toBe(1);
    expect(option.yAxis).toHaveLength(2);
  });

  it('formats each series with its own value format in the combined tooltip', () => {
    const text = option.tooltip.formatter([
      { marker: '●', seriesName: 'Revenue', value: 235400, axisValueLabel: 'Jan' },
      { marker: '●', seriesName: 'Orders', value: 12, axisValueLabel: 'Jan' },
    ]);
    expect(text).toContain('₹2,35,400.00');
    expect(text).toContain('12');
    expect(text).not.toContain('₹12');
  });

  it('forces whole-number ticks on the orders axis when allowDecimals is false', () => {
    expect(option.yAxis[1].minInterval).toBe(1);
  });
});
