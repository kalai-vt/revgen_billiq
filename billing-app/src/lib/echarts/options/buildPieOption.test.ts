import { describe, expect, it } from 'vitest';
import { buildPieOption } from './buildPieOption';
import { formatCompactCurrency } from '../formatters';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOption = any;

describe('buildPieOption', () => {
  it('maps each slice to a pie data point with a color assigned', () => {
    const option: AnyOption = buildPieOption({
      slices: [
        { name: 'CASH', value: 100 },
        { name: 'CARD', value: 200 },
      ],
      themeName: 'billiq-light',
    });
    const data = option.series[0].data;
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('CASH');
    expect(data[0].itemStyle.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('renders as a doughnut (inner radius > 0) by default', () => {
    const option: AnyOption = buildPieOption({
      slices: [{ name: 'CASH', value: 100 }],
      themeName: 'billiq-light',
    });
    expect(option.series[0].radius).toEqual(['55%', '75%']);
  });

  it('renders as a full pie when doughnut is disabled', () => {
    const option: AnyOption = buildPieOption({
      slices: [{ name: 'CASH', value: 100 }],
      themeName: 'billiq-light',
      doughnut: false,
    });
    expect(option.series[0].radius).toBe('75%');
  });

  it('adds a center-label graphic with the formatted total only for doughnuts with a centerLabel', () => {
    const withLabel: AnyOption = buildPieOption({
      slices: [
        { name: 'CASH', value: 100 },
        { name: 'CARD', value: 150 },
      ],
      themeName: 'billiq-light',
      centerLabel: { title: 'Total', formatter: formatCompactCurrency },
    });
    expect(withLabel.graphic).toHaveLength(2);
    expect(withLabel.graphic[1].style.text).toBe(formatCompactCurrency(250));

    const withoutLabel: AnyOption = buildPieOption({
      slices: [{ name: 'CASH', value: 100 }],
      themeName: 'billiq-light',
    });
    expect(withoutLabel.graphic).toBeUndefined();
  });
});
