// Core reusable ECharts wrapper. Every migrated chart renders through this —
// it owns responsive resizing, theme (light/dark) selection, base animation
// defaults, and exposes the underlying instance for PNG export / zoom reset.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import type { ECharts } from 'echarts/core';
import echarts, { type EChartsOption } from './echarts-core';
import { useEChartsTheme } from './useEChartsTheme';
import { BASE_ANIMATION } from './options/shared';

export interface BaseEChartHandle {
  getInstance: () => ECharts | undefined;
  resetZoom: () => void;
}

interface BaseEChartProps {
  option: EChartsOption;
  /** Defaults to true: each chart's data is independent per fetch, so we don't
   * want stale series lingering from a previous option shape. */
  notMerge?: boolean;
  onChartReady?: (instance: ECharts) => void;
}

export const BaseEChart = forwardRef<BaseEChartHandle, BaseEChartProps>(function BaseEChart(
  { option, notMerge = true, onChartReady },
  ref
) {
  const themeName = useEChartsTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReactEChartsCore>(null);

  useImperativeHandle(
    ref,
    () => ({
      // echarts-for-react's `ECharts` type comes from the full `echarts` package's
      // .d.ts, while ours (below) comes from the tree-shaken `echarts/core` entry —
      // same runtime class, but TS treats them as distinct nominal types because of
      // a private-field brand collision, hence the `unknown` bridge.
      getInstance: () => chartRef.current?.getEchartsInstance() as unknown as ECharts | undefined,
      resetZoom: () => {
        chartRef.current?.getEchartsInstance()?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
      },
    }),
    []
  );

  // echarts-for-react only auto-resizes on `window` resize; container-only
  // resizes (sidebar collapse, this card's own flex layout, e.g.
  // CashFlowSummaryChart's KPI-row-plus-chart column) need an explicit observer.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => {
      chartRef.current?.getEchartsInstance()?.resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const mergedOption: EChartsOption = { ...BASE_ANIMATION, ...option };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <ReactEChartsCore
        ref={chartRef}
        echarts={echarts}
        option={mergedOption}
        theme={themeName}
        notMerge={notMerge}
        lazyUpdate
        onChartReady={onChartReady ? (instance) => onChartReady(instance as unknown as ECharts) : undefined}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
});
