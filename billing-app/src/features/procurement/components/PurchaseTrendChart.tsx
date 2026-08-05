import { useMemo, useRef } from 'react';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ChartExportFormat } from '@/components/shared/ExportDropdown';
import { BaseEChart, type BaseEChartHandle } from '@/lib/echarts/BaseEChart';
import { useEChartsTheme } from '@/lib/echarts/useEChartsTheme';
import { CHART_SURFACE, modeFor } from '@/lib/echarts/theme';
import { buildAreaOption } from '@/lib/echarts/options';
import { exportChartAsPng } from '@/lib/echarts/exportImage';
import { exportChartDataAsCsv } from '@/lib/echarts/exportCsv';
import type { PurchaseTrendPoint } from '@/features/procurement/api';

interface PurchaseTrendChartProps {
  data: PurchaseTrendPoint[];
  isLoading: boolean;
}

export function PurchaseTrendChart({ data, isLoading }: PurchaseTrendChartProps) {
  const chartRef = useRef<BaseEChartHandle>(null);
  const themeName = useEChartsTheme();

  const option = useMemo(
    () =>
      buildAreaOption({
        categories: data.map((d) => d.bucket_label),
        series: [{ name: 'Purchase Value', values: data.map((d) => d.purchase_value), showAverage: true }],
        themeName,
        valueFormat: 'currency',
      }),
    [data, themeName]
  );

  function handleExport(format: ChartExportFormat) {
    if (format === 'image_png') {
      exportChartAsPng(chartRef.current?.getInstance(), 'purchase-trend', CHART_SURFACE[modeFor(themeName)]);
      return;
    }
    if (format === 'data_csv') {
      exportChartDataAsCsv(
        data,
        [
          { key: 'bucket_label', label: 'Period' },
          { key: 'purchase_value', label: 'Purchase Value' },
          { key: 'purchase_count', label: 'Purchases' },
        ],
        'purchase-trend'
      );
    }
  }

  return (
    <ChartCard
      title="Purchase Trend"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      onExport={handleExport}
      exportFormats={['image_png', 'data_csv']}
    >
      <BaseEChart ref={chartRef} option={option} />
    </ChartCard>
  );
}
