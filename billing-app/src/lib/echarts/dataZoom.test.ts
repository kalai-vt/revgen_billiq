import { describe, expect, it } from 'vitest';
import { DATA_ZOOM_POINT_THRESHOLD, shouldEnableDataZoom } from './dataZoom';

describe('shouldEnableDataZoom', () => {
  it('never enables zoom for categorical data, regardless of size', () => {
    expect(shouldEnableDataZoom(3, 'categorical')).toBe(false);
    expect(shouldEnableDataZoom(1000, 'categorical')).toBe(false);
  });

  it('stays off for time-series data at or below the threshold', () => {
    expect(shouldEnableDataZoom(DATA_ZOOM_POINT_THRESHOLD, 'time-series')).toBe(false);
    expect(shouldEnableDataZoom(1, 'time-series')).toBe(false);
  });

  it('turns on for time-series data past the threshold', () => {
    expect(shouldEnableDataZoom(DATA_ZOOM_POINT_THRESHOLD + 1, 'time-series')).toBe(true);
    expect(shouldEnableDataZoom(24, 'time-series')).toBe(true);
  });
});
