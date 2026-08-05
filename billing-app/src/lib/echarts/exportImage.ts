import type { ECharts } from 'echarts/core';

/** Client-side PNG export via ECharts' own canvas — no html2canvas needed.
 * `backgroundColor` should match the chart's current surface (its tooltip theme
 * exports transparent by default, which would render as invisible-on-invisible
 * on a dark PNG opened outside the app). */
export function exportChartAsPng(instance: ECharts | undefined, filename: string, backgroundColor: string): void {
  if (!instance) return;
  const dataUrl = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor });
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${filename}.png`;
  link.click();
}
