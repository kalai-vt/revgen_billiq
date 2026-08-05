import type { EChartsOption } from './echarts-core';

/** Below this many points, a slider/zoom control is clutter, not a feature —
 * Top-5 categorical bars and the payment-methods pie never cross it. */
export const DATA_ZOOM_POINT_THRESHOLD = 12;

export type DataZoomKind = 'time-series' | 'categorical';

/** Single rule for the whole app: zoom is only worth it on dense time-series
 * data (Hourly Sales' 24 points, wide date-range trend charts). Categorical
 * comparisons (Top Vendors, Payment Methods) never get one, regardless of size. */
export function shouldEnableDataZoom(pointCount: number, kind: DataZoomKind): boolean {
  return kind === 'time-series' && pointCount > DATA_ZOOM_POINT_THRESHOLD;
}

/** Slider + inside (wheel/pinch) zoom, scoped to the x-axis. */
export function buildDataZoom(): NonNullable<EChartsOption['dataZoom']> {
  return [
    { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: true },
    { type: 'slider', xAxisIndex: 0, height: 18, bottom: 4 },
  ];
}
