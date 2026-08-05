// ECharts renders to <canvas>, which cannot resolve CSS custom properties —
// every color here is a literal hex, mirrored from this app's actual shadcn/
// oklch design tokens (src/index.css) so the chart chrome (ink, gridlines,
// borders) matches the rest of the UI in both themes. The series palette is
// net-new: no brand chart palette existed before this migration. Order was
// chosen and validated with the dataviz skill's `validate_palette.js` (adjacent
// CVD ΔE, normal-vision floor, contrast vs this app's actual card surface) —
// violet leads as the requested "brand purple" primary; re-run the validator
// before reordering these slots.
import echarts from './echarts-core';

export const CHART_SURFACE = { light: '#ffffff', dark: '#171717' } as const;

export const CHART_INK = {
  light: { primary: '#0a0a0a', secondary: '#737373', border: '#e5e5e5' },
  dark: { primary: '#fafafa', secondary: '#a1a1a1', border: 'rgba(255,255,255,0.1)' },
} as const;

/** Categorical series palette — validated order (violet primary, aqua, orange, blue,
 * yellow, magenta, green, red). A 9th series should fold into "Other" rather than
 * cycling — see dataviz skill, color-formula.md. */
export const CHART_SERIES = {
  light: ['#4a3aa7', '#1baf7a', '#eb6834', '#2a78d6', '#eda100', '#e87ba4', '#008300', '#e34948'],
  dark: ['#9085e9', '#199e70', '#d95926', '#3987e5', '#c98500', '#d55181', '#008300', '#e66767'],
} as const;

export const CHART_PRIMARY = { light: CHART_SERIES.light[0], dark: CHART_SERIES.dark[0] } as const;

/** Fixed status roles — never reused for an ordinary series. */
export const CHART_STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

/** Single-hue sequential ramp (blue), light -> dark, for heatmap/visualMap use. */
export const SEQUENTIAL_BLUE = [
  '#cde2fb',
  '#9ec5f4',
  '#5598e7',
  '#2a78d6',
  '#1c5cab',
  '#104281',
] as const;

function buildTheme(mode: 'light' | 'dark') {
  const ink = CHART_INK[mode];
  const surface = CHART_SURFACE[mode];
  return {
    color: CHART_SERIES[mode],
    backgroundColor: 'transparent',
    textStyle: { color: ink.primary, fontFamily: 'inherit' },
    title: { textStyle: { color: ink.primary }, subtextStyle: { color: ink.secondary } },
    grid: { borderColor: ink.border },
    categoryAxis: {
      axisLine: { lineStyle: { color: ink.border } },
      axisTick: { lineStyle: { color: ink.border } },
      axisLabel: { color: ink.secondary },
      splitLine: { lineStyle: { color: ink.border } },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: ink.border } },
      axisTick: { lineStyle: { color: ink.border } },
      axisLabel: { color: ink.secondary },
      splitLine: { lineStyle: { color: ink.border, type: 'dashed' } },
    },
    legend: { textStyle: { color: ink.secondary }, inactiveColor: ink.border },
    tooltip: {
      backgroundColor: surface,
      borderColor: ink.border,
      borderWidth: 1,
      textStyle: { color: ink.primary },
      extraCssText: 'box-shadow: 0 4px 20px rgba(0,0,0,0.12); border-radius: 8px; padding: 10px 14px;',
    },
    dataZoom: {
      textStyle: { color: ink.secondary },
      borderColor: ink.border,
      fillerColor:
        mode === 'light' ? 'rgba(74, 58, 167, 0.08)' : 'rgba(144, 133, 233, 0.12)',
      handleColor: CHART_PRIMARY[mode],
    },
  };
}

echarts.registerTheme('billiq-light', buildTheme('light'));
echarts.registerTheme('billiq-dark', buildTheme('dark'));

/** `#rrggbb` -> `rgba(r,g,b,alpha)`, for gradient fills built from a series' flat hex. */
export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type EChartsThemeName = 'billiq-light' | 'billiq-dark';

export function themeNameFor(resolvedTheme: string | undefined): EChartsThemeName {
  return resolvedTheme === 'dark' ? 'billiq-dark' : 'billiq-light';
}

export function modeFor(themeName: EChartsThemeName): 'light' | 'dark' {
  return themeName === 'billiq-dark' ? 'dark' : 'light';
}
