// Literal color values — recharts renders these as raw SVG fill/stroke attributes,
// which do not reliably resolve CSS custom properties (e.g. var(--primary)).
export const CHART_COLORS = ['oklch(0.6 0.15 250)', 'oklch(0.7 0.15 150)', 'oklch(0.75 0.15 80)'];
export const CHART_PRIMARY = CHART_COLORS[0];
