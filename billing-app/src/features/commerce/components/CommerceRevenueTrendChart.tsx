import { useMemo, useRef } from 'react';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ChartExportFormat } from '@/components/shared/ExportDropdown';
import { BaseEChart, type BaseEChartHandle } from '@/lib/echarts/BaseEChart';
import { useEChartsTheme } from '@/lib/echarts/useEChartsTheme';
import { CHART_SURFACE, modeFor } from '@/lib/echarts/theme';
import { buildLineOption } from '@/lib/echarts/options';
import { exportChartAsPng } from '@/lib/echarts/exportImage';
import { exportChartDataAsCsv } from '@/lib/echarts/exportCsv';
import type { CommerceTrendPoint } from '@/features/commerce/api';

interface CommerceRevenueTrendChartProps {
  data: CommerceTrendPoint[];
  isLoading: boolean;
}

export function CommerceRevenueTrendChart({ data, isLoading }: CommerceRevenueTrendChartProps) {
  const chartRef = useRef<BaseEChartHandle>(null);
  const themeName = useEChartsTheme();

  const option = useMemo(
    () =>
      buildLineOption({
        categories: data.map((d) => d.bucket_label),
        series: [
          { name: 'Swiggy', values: data.map((d) => d.swiggy_revenue) },
          { name: 'Zomato', values: data.map((d) => d.zomato_revenue) },
        ],
        themeName,
        valueFormat: 'currency',
      }),
    [data, themeName]
  );

  function handleExport(format: ChartExportFormat) {
    if (format === 'image_png') {
      exportChartAsPng(chartRef.current?.getInstance(), 'revenue-trend', CHART_SURFACE[modeFor(themeName)]);
      return;
    }
    if (format === 'data_csv') {
      exportChartDataAsCsv(
        data,
        [
          { key: 'bucket_label', label: 'Period' },
          { key: 'swiggy_revenue', label: 'Swiggy Revenue' },
          { key: 'zomato_revenue', label: 'Zomato Revenue' },
          { key: 'total_revenue', label: 'Total Revenue' },
          { key: 'order_count', label: 'Orders' },
        ],
        'revenue-trend'
      );
    }
  }

  return (
    <ChartCard
      title="Revenue Trend"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      onExport={handleExport}
      exportFormats={['image_png', 'data_csv']}
    >
      <BaseEChart ref={chartRef} option={option} />
    </ChartCard>
  );
}
