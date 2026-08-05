import { useTheme } from 'next-themes';
import { themeNameFor, type EChartsThemeName } from './theme';

/** Resolves the app's next-themes state (which may be `"system"`) to a registered
 * ECharts theme name, so charts repaint on both explicit toggle and OS changes. */
export function useEChartsTheme(): EChartsThemeName {
  const { resolvedTheme } = useTheme();
  return themeNameFor(resolvedTheme);
}
