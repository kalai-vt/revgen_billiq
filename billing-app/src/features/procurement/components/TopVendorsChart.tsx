import { useMemo, useRef } from 'react';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ChartExportFormat } from '@/components/shared/ExportDropdown';
import { BaseEChart, type BaseEChartHandle } from '@/lib/echarts/BaseEChart';
import { useEChartsTheme } from '@/lib/echarts/useEChartsTheme';
import { CHART_SURFACE, modeFor } from '@/lib/echarts/theme';
import { buildBarOption } from '@/lib/echarts/options';
import { exportChartAsPng } from '@/lib/echarts/exportImage';
import { exportChartDataAsCsv } from '@/lib/echarts/exportCsv';
import type { TopVendor } from '@/features/procurement/api';

interface TopVendorsChartProps {
  data: TopVendor[];
  isLoading: boolean;
}

export function TopVendorsChart({ data, isLoading }: TopVendorsChartProps) {
  const chartRef = useRef<BaseEChartHandle>(null);
  const themeName = useEChartsTheme();

  const option = useMemo(
    () =>
      buildBarOption({
        categories: data.map((d) => d.vendor_name),
        series: [{ name: 'Purchase Value', values: data.map((d) => d.total_amount) }],
        themeName,
        valueFormat: 'currency',
      }),
    [data, themeName]
  );

  function handleExport(format: ChartExportFormat) {
    if (format === 'image_png') {
      exportChartAsPng(chartRef.current?.getInstance(), 'top-vendors', CHART_SURFACE[modeFor(themeName)]);
      return;
    }
    if (format === 'data_csv') {
      exportChartDataAsCsv(
        data,
        [
          { key: 'vendor_name', label: 'Vendor' },
          { key: 'total_amount', label: 'Purchase Value' },
          { key: 'purchase_count', label: 'Purchases' },
        ],
        'top-vendors'
      );
    }
  }

  return (
    <ChartCard
      title="Top Vendors by Purchase Value"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      onExport={handleExport}
      exportFormats={['image_png', 'data_csv']}
    >
      <BaseEChart ref={chartRef} option={option} />
    </ChartCard>
  );
}
